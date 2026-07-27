/* Smažka v52 — clean 1080x1920 VOID verdict cover with final-effect synchronization. */
(() => {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1920;
  const app = window.SmazkaApp;
  const state = app?.state;
  const result = document.getElementById('result');
  if (!result) return;

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

  function drawCoverImage(ctx, image, x, y, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;

    if (imageRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }

    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
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
      image.onerror = reject;
      image.src = src;
    });
  }

  function collectVerdict() {
    const visual = result.querySelector('.result-visual');
    const severityText = visual?.querySelector('.effect-label strong')?.textContent || '0%';
    const severity = Math.max(0, Math.min(100, Number.parseInt(severityText, 10) || 0));
    const visibleImage = visual?.querySelector('img');

    return {
      title: result.querySelector('h2')?.textContent?.trim() || 'Rozsudek odmítl vypovídat',
      description: result.querySelector('.description')?.textContent?.trim() || 'Lokální pseudo AI zachytila stav, který se věda rozhodla dál nekomentovat.',
      severity,
      imageSrc: visibleImage?.currentSrc || visibleImage?.src || state?.effectImageData || state?.currentImageData || '',
      accent: severity >= 80 ? '#f7768e' : '#70e1cf'
    };
  }

  function drawFallbackPhoto(ctx, x, y, width, height, accent) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#111923');
    gradient.addColorStop(0.52, '#0b1118');
    gradient.addColorStop(1, '#070a0f');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    const glow = ctx.createRadialGradient(x + width * 0.5, y + height * 0.42, 30, x + width * 0.5, y + height * 0.42, width * 0.58);
    glow.addColorStop(0, `${accent}44`);
    glow.addColorStop(1, 'rgba(7, 10, 15, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, width, height);
  }

  async function createCoverBlob(verdict) {
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
    ctx.letterSpacing = '3px';
    ctx.fillText('LOKÁLNÍ PSEUDO AI // VOID SCAN', 58, 116);
    ctx.letterSpacing = '0px';

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
        drawCoverImage(ctx, image, photoX, photoY, photoWidth, photoHeight);
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

    const edgeVignette = ctx.createRadialGradient(WIDTH / 2, photoY + photoHeight * 0.43, 180, WIDTH / 2, photoY + photoHeight * 0.43, 760);
    edgeVignette.addColorStop(0, 'rgba(7, 10, 15, 0)');
    edgeVignette.addColorStop(1, 'rgba(7, 10, 15, 0.42)');
    ctx.fillStyle = edgeVignette;
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
    ctx.lineWidth = 2;
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
    ctx.textAlign = 'left';
    const titleLineHeight = Math.round(titleSize * 0.98);
    const titleHeight = drawLines(ctx, titleLines, 58, 1420, titleLineHeight);

    ctx.fillStyle = 'rgba(226, 235, 234, 0.72)';
    ctx.font = '500 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const descriptionY = 1420 + titleHeight + 48;
    const descriptionLines = lineBreaks(ctx, verdict.description, 930, 4);
    drawLines(ctx, descriptionLines, 58, descriptionY, 50);

    ctx.fillStyle = 'rgba(226, 235, 234, 0.38)';
    ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('FOTKA ZŮSTALA V ZAŘÍZENÍ · MEME, NE DIAGNÓZA', 58, 1844);

    ctx.textAlign = 'right';
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 24px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('JSEM SMAŽKA?', 1022, 1844);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Obálku se nepovedlo vyrenderovat'));
      }, 'image/jpeg', 0.94);
    });
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

  async function shareCover(button) {
    const label = button.querySelector('span:last-child');
    const originalLabel = label?.textContent || 'Sdílet rozsudek';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (label) label.textContent = 'Tisknu obálku…';

    try {
      await Promise.resolve(state?.shareImagePromise).catch(() => undefined);
      const verdict = collectVerdict();
      const blob = await createCoverBlob(verdict);
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
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (label) label.textContent = originalLabel;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#shareResultButton');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    shareCover(button);
  }, true);
})();