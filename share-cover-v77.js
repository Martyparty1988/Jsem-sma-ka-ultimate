/* Smažka v77 — lazy, cached 1080×1920 share cover with released legacy buffers. */
(() => {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1920;
  const app = window.SmazkaApp;
  const state = app?.state;
  const result = app?.elements?.result || document.getElementById('result');
  const legacyCanvas = app?.elements?.canvas || document.getElementById('canvas');
  const cropApi = window.SmazkaFaceCrop;
  if (!state || !result) return;

  let cachedToken = '';
  let cachedBlob = null;
  let pendingBlob = null;
  let shareBusy = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function lineBreaks(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);

    if (lines.length > maxLines) {
      const visible = lines.slice(0, maxLines);
      visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,!?…]*$/, '')}…`;
      return visible;
    }
    return lines;
  }

  function drawLines(ctx, lines, x, y, lineHeight) {
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return lines.length * lineHeight;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Sdílecí fotku se nepovedlo dekódovat'));
      image.src = src;
    });
  }

  function drawCoverImage(ctx, image, x, y, width, height, faceAnalysis) {
    if (typeof cropApi?.drawImageCover === 'function') {
      cropApi.drawImageCover(ctx, image, x, y, width, height, faceAnalysis);
      return;
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const imageRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (imageRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function collectVerdict() {
    const visual = result.querySelector('.result-visual');
    const severityText = visual?.querySelector('.effect-label strong')?.textContent || '0%';
    const severity = clamp(Number.parseInt(severityText, 10) || 0, 0, 100);
    const visibleImage = visual?.querySelector('img:not(.junkie-share-source)');
    const imageSrc = visibleImage?.currentSrc
      || visibleImage?.src
      || state.effectImageData
      || state.currentImageData
      || '';

    return {
      title: result.querySelector('h2')?.textContent?.trim() || 'Rozsudek odmítl vypovídat',
      description: result.querySelector('.description')?.textContent?.trim()
        || 'Lokální pseudo AI zachytila stav, který se věda rozhodla dál nekomentovat.',
      severity,
      imageSrc,
      faceAnalysis: state.effectFaceAnalysis || state.faceAnalysis || null,
      accent: severity >= 80 ? '#f7768e' : '#70e1cf'
    };
  }

  function verdictToken(verdict) {
    return [
      verdict.title,
      verdict.description,
      verdict.severity,
      String(verdict.imageSrc).slice(-64)
    ].join('|');
  }

  function drawFallbackPhoto(ctx, x, y, width, height, accent) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#111923');
    gradient.addColorStop(0.52, '#0b1118');
    gradient.addColorStop(1, '#070a0f');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    const glow = ctx.createRadialGradient(
      x + width * 0.5,
      y + height * 0.42,
      30,
      x + width * 0.5,
      y + height * 0.42,
      width * 0.58
    );
    glow.addColorStop(0, `${accent}44`);
    glow.addColorStop(1, 'rgba(7, 10, 15, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, width, height);
  }

  async function renderCoverBlob(verdict) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas není dostupný');

    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const ambient = ctx.createRadialGradient(870, 120, 20, 870, 120, 540);
    ambient.addColorStop(0, `${verdict.accent}1f`);
    ambient.addColorStop(1, 'rgba(7, 10, 15, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, WIDTH, 720);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f7f6';
    ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('SMAŽKA', 58, 80);
    ctx.fillStyle = 'rgba(226, 235, 234, 0.5)';
    ctx.font = '700 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('LOKÁLNÍ PSEUDO AI // VOID SCAN', 58, 116);

    const photoX = 48;
    const photoY = 156;
    const photoWidth = 984;
    const photoHeight = 1116;

    ctx.save();
    roundedRect(ctx, photoX, photoY, photoWidth, photoHeight, 38);
    ctx.clip();

    if (verdict.imageSrc) {
      try {
        const image = await loadImage(verdict.imageSrc);
        drawCoverImage(ctx, image, photoX, photoY, photoWidth, photoHeight, verdict.faceAnalysis);
        image.removeAttribute('src');
      } catch {
        drawFallbackPhoto(ctx, photoX, photoY, photoWidth, photoHeight, verdict.accent);
      }
    } else {
      drawFallbackPhoto(ctx, photoX, photoY, photoWidth, photoHeight, verdict.accent);
    }

    const photoVignette = ctx.createLinearGradient(0, photoY, 0, photoY + photoHeight);
    photoVignette.addColorStop(0, 'rgba(7, 10, 15, 0.04)');
    photoVignette.addColorStop(0.58, 'rgba(7, 10, 15, 0.02)');
    photoVignette.addColorStop(1, 'rgba(7, 10, 15, 0.88)');
    ctx.fillStyle = photoVignette;
    ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
    ctx.restore();

    ctx.strokeStyle = 'rgba(226, 235, 234, 0.16)';
    ctx.lineWidth = 2;
    roundedRect(ctx, photoX, photoY, photoWidth, photoHeight, 38);
    ctx.stroke();

    ctx.fillStyle = 'rgba(7, 10, 15, 0.76)';
    roundedRect(ctx, 76, 188, 250, 58, 29);
    ctx.fill();
    ctx.strokeStyle = `${verdict.accent}66`;
    ctx.stroke();
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VOID VERDIKT', 201, 225);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f7faf9';
    ctx.font = '900 142px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${verdict.severity}%`, 966, 1190);

    ctx.textAlign = 'left';
    ctx.fillStyle = verdict.accent;
    ctx.fillRect(58, 1324, 100, 8);

    let titleSize = 86;
    let titleLines = [];
    do {
      ctx.font = `900 ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      titleLines = lineBreaks(ctx, verdict.title, 964, 3);
      if (titleLines.length <= 2 || titleSize <= 64) break;
      titleSize -= 4;
    } while (titleSize >= 64);

    ctx.fillStyle = '#f7faf9';
    const titleHeight = drawLines(ctx, titleLines, 58, 1420, Math.round(titleSize * 0.98));
    ctx.fillStyle = 'rgba(226, 235, 234, 0.72)';
    ctx.font = '500 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawLines(ctx, lineBreaks(ctx, verdict.description, 930, 4), 58, 1420 + titleHeight + 48, 50);

    ctx.fillStyle = 'rgba(226, 235, 234, 0.38)';
    ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('FOTKA ZŮSTALA V ZAŘÍZENÍ · MEME, NE DIAGNÓZA', 58, 1844);
    ctx.textAlign = 'right';
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 24px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('JSEM SMAŽKA?', 1022, 1844);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        canvas.width = 1;
        canvas.height = 1;
        if (blob) resolve(blob);
        else reject(new Error('Obálku se nepovedlo vyrenderovat'));
      }, 'image/jpeg', 0.94);
    });
  }

  function getCoverBlob(verdict) {
    const token = verdictToken(verdict);
    if (cachedBlob && cachedToken === token) return Promise.resolve(cachedBlob);
    if (pendingBlob && cachedToken === token) return pendingBlob;

    cachedToken = token;
    cachedBlob = null;
    pendingBlob = renderCoverBlob(verdict)
      .then((blob) => {
        cachedBlob = blob;
        return blob;
      })
      .finally(() => {
        pendingBlob = null;
      });
    return pendingBlob;
  }

  function clearCoverCache() {
    cachedToken = '';
    cachedBlob = null;
    pendingBlob = null;
  }

  function downloadBlob(blob) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'jsem-smazka-void-verdict.jpg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function releaseLegacyCanvasBuffer() {
    if (!legacyCanvas || result.classList.contains('hidden') || shareBusy) return;
    if (legacyCanvas.width <= 1 && legacyCanvas.height <= 1) return;
    legacyCanvas.width = 1;
    legacyCanvas.height = 1;
    legacyCanvas.dataset.releasedBy = 'share-v77';
  }

  async function shareCover(button) {
    const label = button.querySelector('span:last-child');
    const originalLabel = label?.textContent || 'Sdílet rozsudek';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    shareBusy = true;
    if (label) label.textContent = cachedBlob ? 'Otevírám obálku…' : 'Tisknu obálku…';

    try {
      await Promise.resolve(state.shareImagePromise).catch(() => undefined);
      const verdict = collectVerdict();
      const blob = await getCoverBlob(verdict);
      const file = new File([blob], 'jsem-smazka-void-verdict.jpg', { type: 'image/jpeg' });
      const shareData = {
        title: `Jsem ${verdict.title}!`,
        text: `${verdict.description} Zkus si VOID sken taky.`,
        files: [file]
      };

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        downloadBlob(blob);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('VOID cover share failed:', error);
        if (label) label.textContent = 'Sdílení selhalo';
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } finally {
      shareBusy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (label) label.textContent = originalLabel;
      releaseLegacyCanvasBuffer();
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#shareResultButton');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void shareCover(button);
  }, true);

  const resultObserver = new MutationObserver(() => {
    if (result.classList.contains('hidden')) {
      clearCoverCache();
      return;
    }
    window.setTimeout(releaseLegacyCanvasBuffer, 0);
    window.setTimeout(releaseLegacyCanvasBuffer, 450);
    window.setTimeout(releaseLegacyCanvasBuffer, 1400);
  });
  resultObserver.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src']
  });

  window.addEventListener('pagehide', () => {
    clearCoverCache();
    releaseLegacyCanvasBuffer();
    resultObserver.disconnect();
  }, { once: true });

  window.SmazkaShareCover = Object.freeze({
    clearCoverCache,
    collectVerdict,
    verdictToken
  });
})();