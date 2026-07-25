/* Pure geometric face deformation – original pixels only, no filters or replacement. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result || !app?.elements?.canvas) return;

  const { state, elements } = app;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeRun = 0;

  const tiers = {
    mild: [
      { key: 'bulge', label: 'Lehce roztažený obličej', modes: ['bulge'] },
      { key: 'pinch', label: 'Lehce zmáčknutý obličej', modes: ['pinch'] },
      { key: 'tilt', label: 'Křivě posunutý obličej', modes: ['tilt', 'wave'] }
    ],
    medium: [
      { key: 'wave', label: 'Zvlněný obličej', modes: ['wave', 'bulge'] },
      { key: 'squeeze', label: 'Gumově zmáčknutý obličej', modes: ['squeeze', 'pinch'] },
      { key: 'rubber', label: 'Gumový obličej', modes: ['wave', 'squeeze', 'tilt'] },
      { key: 'forehead', label: 'Přefouknuté čelo', modes: ['forehead', 'pinch'] },
      { key: 'jaw', label: 'Roztažená čelist', modes: ['jaw', 'bulge'] }
    ],
    high: [
      { key: 'melt', label: 'Protažený obličej', modes: ['melt', 'wave'] },
      { key: 'drip', label: 'Obličej tažený dolů', modes: ['melt', 'bulge', 'jaw'] },
      { key: 'collapse', label: 'Silně deformovaný obličej', modes: ['melt', 'pinch', 'wave'] },
      { key: 'wide', label: 'Obličej roztažený do stran', modes: ['wide', 'bulge', 'wave'] },
      { key: 'accordion', label: 'Obličej jako harmonika', modes: ['accordion', 'squeeze', 'tilt'] },
      { key: 'crooked', label: 'Totálně křivý obličej', modes: ['tilt', 'jaw', 'wave'] }
    ],
    critical: [
      { key: 'critical', label: 'Extrémně roztažený obličej', modes: ['wide', 'melt', 'wave', 'bulge'] },
      { key: 'implosion', label: 'Extrémně zmáčknutý obličej', modes: ['melt', 'pinch', 'squeeze', 'accordion'] },
      { key: 'liquid', label: 'Tekutě protažený obličej', modes: ['melt', 'wave', 'squeeze', 'jaw'] },
      { key: 'megahead', label: 'Hlava nafouknutá na maximum', modes: ['forehead', 'wide', 'bulge'] },
      { key: 'facequake', label: 'Obličej po zemětřesení', modes: ['wave', 'tilt', 'accordion', 'melt'] },
      { key: 'junkymelt', label: 'Totální junky rozpad', modes: ['melt', 'wide', 'jaw', 'wave'] }
    ]
  };

  function cryptoRandom(max) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % max;
  }

  function chooseProfile(severity, seed) {
    const tier = severity < 30 ? tiers.mild : severity < 58 ? tiers.medium : severity < 82 ? tiers.high : tiers.critical;
    return tier[Math.abs(seed) % tier.length];
  }

  function noise(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function easeOut(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Zdroj deformace se nepovedlo načíst'));
      image.src = source;
    });
  }

  function drawCover(context, image, x, y, width, height) {
    const imageRatio = image.width / image.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function createSource(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawCover(canvas.getContext('2d'), image, 0, 0, width, height);
    return canvas;
  }

  function renderFrame(source, output, profile, severity, progress, seed) {
    const width = output.width;
    const height = output.height;
    const strength = Math.min(1.08, 0.2 + (severity / 100) * 0.98) * easeOut(progress);
    const has = (mode) => profile.modes.includes(mode);
    const strip = width >= 700 ? 5 : 4;
    const horizontal = document.createElement('canvas');
    horizontal.width = width;
    horizontal.height = height;
    const hctx = horizontal.getContext('2d');
    const context = output.getContext('2d');

    for (let y = 0; y < height; y += strip) {
      const vertical = y / height;
      const faceY = (vertical - 0.45) / 0.35;
      const faceMask = Math.exp(-faceY * faceY * 1.55);
      const foreheadMask = Math.exp(-Math.pow((vertical - 0.29) / 0.18, 2));
      const jawMask = Math.exp(-Math.pow((vertical - 0.64) / 0.18, 2));
      const featureProtection = Math.exp(-Math.pow((vertical - 0.43) / 0.12, 2));
      const mask = faceMask * (1 - featureProtection * 0.24);

      let scale = 1;
      if (has('bulge')) scale += 0.34 * strength * mask;
      if (has('wide')) scale += 0.48 * strength * mask;
      if (has('pinch')) scale -= 0.24 * strength * mask;
      if (has('squeeze')) scale -= 0.18 * strength * mask * (0.58 + 0.42 * Math.sin(y * 0.034 + seed));
      if (has('forehead')) scale += 0.52 * strength * foreheadMask;
      if (has('jaw')) scale += 0.46 * strength * jawMask;
      if (has('accordion')) scale += Math.sin(y * 0.075 + seed) * 0.22 * strength * mask;

      const wave = has('wave')
        ? Math.sin(y * 0.042 + seed * 0.13) * width * 0.055 * strength * mask
        : 0;
      const tilt = has('tilt')
        ? (vertical - 0.5) * width * 0.17 * strength * mask
        : 0;

      const drawWidth = width * Math.max(0.54, scale);
      const dx = (width - drawWidth) / 2 + wave + tilt;
      hctx.drawImage(
        source,
        0,
        y,
        width,
        Math.min(strip + 1, height - y),
        dx,
        y,
        drawWidth,
        Math.min(strip + 1, height - y)
      );
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(horizontal, 0, 0);

    if (has('melt')) {
      const meltTop = Math.round(height * 0.43);
      const meltHeight = Math.round(height * 0.43);
      const center = width / 2;
      const radius = width * 0.4;

      for (let x = Math.round(width * 0.11); x < width * 0.89; x += strip) {
        const normalized = (x - center) / radius;
        const mask = Math.pow(Math.max(0, 1 - normalized * normalized), 1.35);
        const random = noise(x * 0.41 + seed * 8.7);
        const pull = Math.round(
          height * (0.012 + 0.16 * strength * strength) * mask * (0.32 + random * 0.68)
        );
        const sway = Math.round(Math.sin(x * 0.043 + seed) * width * 0.018 * strength * mask);

        if (pull > 1) {
          context.drawImage(
            horizontal,
            x,
            meltTop,
            strip + 1,
            meltHeight,
            x + sway,
            meltTop,
            strip + 1,
            meltHeight + pull
          );
        }
      }
    }
  }

  async function animateCanvas(canvas, imageData, profile, severity, seed, runId) {
    const image = await loadImage(imageData);
    if (runId !== activeRun) return;
    canvas.width = 480;
    canvas.height = 640;
    const source = createSource(image, canvas.width, canvas.height);
    renderFrame(source, canvas, profile, severity, 0, seed);

    if (reducedMotion()) {
      renderFrame(source, canvas, profile, severity, 1, seed);
      return;
    }

    const started = performance.now();
    const duration = 1080;
    elements.result.classList.add('warp-progress');

    await new Promise((resolve) => {
      const frame = (now) => {
        if (runId !== activeRun) return resolve();
        const progress = Math.min(1, (now - started) / duration);
        renderFrame(source, canvas, profile, severity, progress, seed);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    elements.result.classList.remove('warp-progress');
  }

  async function createFinalImage(imageData, profile, severity, seed) {
    const image = await loadImage(imageData);
    const source = createSource(image, 720, 960);
    const output = document.createElement('canvas');
    output.width = 720;
    output.height = 960;
    renderFrame(source, output, profile, severity, 1, seed);
    return output.toDataURL('image/png');
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    const visible = lines.slice(0, maxLines);
    if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,!?…]*$/, '')}…`;
    visible.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  }

  async function drawShareCard(imageData, title, description, severity, profile) {
    const image = await loadImage(imageData);
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');
    const width = 1080;
    const imageHeight = 900;
    const panelHeight = 450;
    canvas.width = width;
    canvas.height = imageHeight + panelHeight;

    const background = context.createLinearGradient(0, 0, width, canvas.height);
    background.addColorStop(0, '#0f172a');
    background.addColorStop(0.55, '#071426');
    background.addColorStop(1, '#020617');
    context.fillStyle = background;
    context.fillRect(0, 0, width, canvas.height);
    drawCover(context, image, 0, 0, width, imageHeight);

    context.fillStyle = 'rgba(2,6,23,0.76)';
    context.fillRect(42, 42, 540, 62);
    context.fillStyle = '#67e8f9';
    context.font = '800 24px ui-monospace, monospace';
    context.textAlign = 'left';
    context.fillText(`SMŽK / ${profile.key.toUpperCase()} / DAMAGE ${severity}%`, 64, 82);

    context.fillStyle = 'rgba(2,6,23,0.97)';
    context.fillRect(0, imageHeight, width, panelHeight);
    const accent = context.createLinearGradient(0, imageHeight, width, imageHeight);
    accent.addColorStop(0, '#22d3ee');
    accent.addColorStop(1, '#34d399');
    context.fillStyle = accent;
    context.fillRect(0, imageHeight, width, 8);

    context.textAlign = 'center';
    context.fillStyle = '#67e8f9';
    context.font = '700 28px ui-sans-serif, sans-serif';
    context.fillText(`LOKÁLNÍ AI DETEKCE DEVASTACE • ${severity}%`, width / 2, imageHeight + 58);
    context.fillStyle = '#fff';
    let titleSize = 66;
    context.font = `800 ${titleSize}px ui-sans-serif, sans-serif`;
    while (context.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      context.font = `800 ${titleSize}px ui-sans-serif, sans-serif`;
    }
    context.fillText(title, width / 2, imageHeight + 145);
    context.fillStyle = '#d9e1df';
    context.font = 'italic 38px ui-sans-serif, sans-serif';
    wrapText(context, description, width / 2, imageHeight + 220, width - 130, 48, 3);
    context.fillStyle = 'rgba(217,225,223,0.5)';
    context.font = '28px ui-sans-serif, sans-serif';
    context.fillText('jsemsmazka.cz • jen pro srandu, ne diagnóza', width / 2, imageHeight + panelHeight - 52);
  }

  function resultToken() {
    const title = state.lastAnalysisResult?.title || '';
    const severity = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50);
    const imageTail = String(state.currentImageData || '').slice(-32);
    return `${title}|${severity}|${imageTail}`;
  }

  async function upgradeResult() {
    if (elements.result.classList.contains('hidden') || !state.currentImageData) return;
    const token = resultToken();
    if (elements.result.dataset.warpToken === token) return;
    elements.result.dataset.warpToken = token;

    const runId = ++activeRun;
    const severity = Math.max(12, Math.min(98, Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50)));
    const seed = cryptoRandom(100000) + 1;
    const profile = chooseProfile(severity, seed);
    const visual = elements.result.querySelector('.result-visual');
    if (!visual) return;

    visual.className = `result-visual effect-${profile.key}`;
    visual.style.setProperty('--effect-strength', String(severity / 100));

    const oldMedia = visual.querySelector('img, canvas');
    const canvas = document.createElement('canvas');
    canvas.className = 'warp-result-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Geometricky deformovaný původní obličej. Intenzita efektu ${severity} procent.`);
    oldMedia?.replaceWith(canvas);

    const label = visual.querySelector('.effect-label');
    if (label) label.innerHTML = `<span>${profile.label}</span><strong>${severity}%</strong>`;

    state.effectSeverity = severity;
    state.effectProfile = profile;
    state.effectSeed = seed;

    animateCanvas(canvas, state.currentImageData, profile, severity, seed, runId).catch((error) => {
      console.warn('Animovaná deformace selhala:', error);
    });

    state.shareImagePromise = createFinalImage(state.currentImageData, profile, severity, seed)
      .then(async (finalImage) => {
        if (runId !== activeRun) return;
        state.effectImageData = finalImage;
        await drawShareCard(
          finalImage,
          state.lastAnalysisResult?.title || 'Neznámý stav',
          state.lastAnalysisResult?.description || '',
          severity,
          profile
        );
      })
      .catch((error) => {
        console.warn('Příprava deformovaného PNG selhala:', error);
      });
  }

  const observer = new MutationObserver(() => requestAnimationFrame(upgradeResult));
  observer.observe(elements.result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  upgradeResult();
})();
