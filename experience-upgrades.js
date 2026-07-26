/* Smažka Scan experience upgrades – local-only, no external dependencies. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements?.result || !app?.state) return;

  const { elements, state } = app;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let resultRun = 0;
  let extraDamage = 0;
  let diagnosisTimer = null;

  const secondaryDiagnoses = [
    'Levá půlka obličeje už odešla domů. Pravá pořád čeká na poslední spoj.',
    'Mozek se pokusil restartovat, ale našel jen popelník a tři cizí vzpomínky.',
    'Čelist hlásí přesčas. Zuby mezitím rozjely vlastní afterparty.',
    'Důstojnost byla naposledy zachycena včera ve 23:17. Další stopa není.',
    'Systém našel zbytky soudnosti. Byly označeny jako nebezpečný odpad.',
    'Oči jedou každá jinou směnu a nos odmítá vypovídat bez advokáta.',
    'Tělo je online, majitel účtu se ale dlouhodobě nepřihlásil.',
    'Obličej byl sestaven z náhradních dílů po zavírací době.',
    'V hlavě běží nouzový generátor. Palivo: paranoia a poslední cigáro.',
    'Dodatečný nález: duše zaparkovaná na zákazu stání před nonstopem.',
    'Paměť je plná. Všechny soubory mají název final_final_opravdu_final.',
    'Krevní skupina nezjištěna. Vzorek odpovídá energetáku s popelem.',
    'Mimika se odpojila od serveru. Obličej pokračuje v offline režimu.',
    'Čelo dorazilo první, zbytek obličeje nabral zpoždění dvě zastávky.',
    'Diagnostika dokončena: hardware přežil, software se odstěhoval.'
  ];

  const extraProfiles = [
    { key: 'widescreen', label: 'Obličej v režimu širokoúhlý peklo', rows: true, amount: 0.46 },
    { key: 'jawdrop', label: 'Čelist vytažená z kolejí', rows: true, amount: 0.58 },
    { key: 'forehead', label: 'Čelo po developerským projektu', rows: true, amount: 0.5 },
    { key: 'sidepull', label: 'Ksicht tažený k nonstopu', rows: true, amount: 0.38 },
    { key: 'accordion', label: 'Junky harmonika', rows: true, amount: 0.42 },
    { key: 'spiral', label: 'Obličej zamotanej do vlastní směny', columns: true, amount: 0.32 },
    { key: 'liquid', label: 'Tekutá pracovní morálka', columns: true, amount: 0.48 },
    { key: 'implosion', label: 'Ksicht po vnitřním výbuchu', rows: true, amount: -0.34 }
  ];

  function randomIndex(length) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * length);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % length;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Deformovaný snímek se nepovedlo načíst'));
      image.src = source;
    });
  }

  function canvasToDataUrl(canvas) {
    return canvas.toDataURL('image/png');
  }

  function copyCanvas(source) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  }

  function applyRowWarp(source, output, profile, progress, seed) {
    const width = output.width;
    const height = output.height;
    const context = output.getContext('2d');
    const strip = 4;
    context.clearRect(0, 0, width, height);

    for (let y = 0; y < height; y += strip) {
      const v = y / height;
      const face = Math.exp(-Math.pow((v - 0.46) / 0.34, 2));
      const forehead = Math.exp(-Math.pow((v - 0.27) / 0.17, 2));
      const jaw = Math.exp(-Math.pow((v - 0.66) / 0.18, 2));
      let mask = face;
      let amount = profile.amount * progress * (0.7 + extraDamage * 0.08);
      let shift = 0;

      if (profile.key === 'forehead') mask = forehead;
      if (profile.key === 'jawdrop') mask = jaw;
      if (profile.key === 'accordion') amount *= Math.sin(y * 0.075 + seed) * 0.85;
      if (profile.key === 'sidepull') shift = Math.sin(v * Math.PI) * width * amount * 0.34;
      if (profile.key === 'implosion') amount = Math.max(-0.52, amount);

      const drawWidth = width * Math.max(0.5, 1 + amount * mask);
      const wobble = Math.sin(y * 0.035 + seed * 0.1) * width * 0.028 * progress * face;
      const dx = (width - drawWidth) / 2 + wobble + shift;
      context.drawImage(source, 0, y, width, Math.min(strip + 1, height - y), dx, y, drawWidth, Math.min(strip + 1, height - y));
    }
  }

  function applyColumnWarp(source, output, profile, progress, seed) {
    const width = output.width;
    const height = output.height;
    const context = output.getContext('2d');
    const strip = 4;
    context.clearRect(0, 0, width, height);

    for (let x = 0; x < width; x += strip) {
      const n = (x - width / 2) / (width * 0.42);
      const mask = Math.pow(Math.max(0, 1 - n * n), 1.3);
      const random = 0.38 + ((Math.sin((x + seed) * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.62;
      const pull = height * profile.amount * progress * mask * random * (0.56 + extraDamage * 0.08);
      const sway = profile.key === 'spiral'
        ? Math.sin(x * 0.04 + seed) * width * 0.035 * progress * mask
        : Math.sin(x * 0.025 + seed) * width * 0.012 * progress * mask;
      context.drawImage(source, x, 0, Math.min(strip + 1, width - x), height, x + sway, 0, Math.min(strip + 1, width - x), height + pull);
    }
  }

  async function animateExtraWarp(canvas, profile, runId) {
    const source = copyCanvas(canvas);
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const duration = reducedMotion() ? 1 : 820;
    const started = performance.now();

    elements.result.classList.add('extra-warp-progress');

    await new Promise((resolve) => {
      const frame = (now) => {
        if (runId !== resultRun) return resolve();
        const progress = reducedMotion() ? 1 : Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (profile.columns) applyColumnWarp(source, output, profile, eased, runId * 17.3);
        else applyRowWarp(source, output, profile, eased, runId * 17.3);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        canvas.getContext('2d').drawImage(output, 0, 0);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    elements.result.classList.remove('extra-warp-progress');
    return canvasToDataUrl(canvas);
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/);
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
    if (lines.length > maxLines && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.,!?…]*$/, '')}…`;
    visible.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  }

  async function rebuildShareCard(imageData) {
    const image = await loadImage(imageData);
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');
    const width = 1080;
    const imageHeight = 900;
    const panelHeight = 450;
    canvas.width = width;
    canvas.height = imageHeight + panelHeight;

    const imageRatio = image.width / image.height;
    const targetRatio = width / imageHeight;
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
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, imageHeight);

    context.fillStyle = 'rgba(2,6,23,0.95)';
    context.fillRect(0, imageHeight, width, panelHeight);
    const accent = context.createLinearGradient(0, imageHeight, width, imageHeight);
    accent.addColorStop(0, '#22d3ee');
    accent.addColorStop(1, '#34d399');
    context.fillStyle = accent;
    context.fillRect(0, imageHeight, width, 8);

    const title = state.lastAnalysisResult?.title || 'Neznámý stav';
    const description = state.lastAnalysisResult?.description || '';
    const severity = Math.min(100, Number(state.effectSeverity || state.lastAnalysisResult?.severity || 50) + extraDamage * 7);

    context.textAlign = 'center';
    context.fillStyle = '#67e8f9';
    context.font = '700 28px ui-sans-serif, sans-serif';
    context.fillText(`LOKÁLNÍ DETEKCE DEVASTACE • DAMAGE ${severity}%`, width / 2, imageHeight + 58);
    context.fillStyle = '#fff';
    let titleSize = 66;
    context.font = `900 ${titleSize}px ui-sans-serif, sans-serif`;
    while (context.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      context.font = `900 ${titleSize}px ui-sans-serif, sans-serif`;
    }
    context.fillText(title, width / 2, imageHeight + 145);
    context.fillStyle = '#d9e1df';
    context.font = 'italic 38px ui-sans-serif, sans-serif';
    wrapText(context, description, width / 2, imageHeight + 220, width - 130, 48, 3);
    context.fillStyle = 'rgba(217,225,223,0.5)';
    context.font = '28px ui-sans-serif, sans-serif';
    context.fillText('jsemsmazka.cz • černý humor, ne diagnóza', width / 2, imageHeight + panelHeight - 52);
  }

  function updateDamageLabel(profile) {
    const label = elements.result.querySelector('.effect-label');
    const severity = Math.min(100, Number(state.effectSeverity || state.lastAnalysisResult?.severity || 50) + extraDamage * 7);
    if (label) label.innerHTML = `<span>${profile.label}</span><strong>${severity}%</strong>`;
    state.effectSeverity = severity;
  }

  async function destroyMore(button) {
    const canvas = elements.result.querySelector('.warp-result-canvas');
    if (!canvas || button.disabled) return;
    button.disabled = true;
    extraDamage = Math.min(5, extraDamage + 1);
    const profile = extraProfiles[randomIndex(extraProfiles.length)];
    const runId = ++resultRun;
    updateDamageLabel(profile);

    try {
      const finalImage = await animateExtraWarp(canvas, profile, runId);
      state.effectImageData = finalImage;
      state.shareImagePromise = rebuildShareCard(finalImage);
      await state.shareImagePromise;
      button.querySelector('span:last-child').textContent = extraDamage >= 5 ? 'Totální konečná' : 'Ještě víc mě znič';
      button.disabled = extraDamage >= 5;
    } catch (error) {
      console.warn('Další destrukce obličeje selhala:', error);
      button.disabled = false;
    }
  }

  function addDestroyButton() {
    const actions = elements.result.querySelector('.result-actions');
    if (!actions || actions.querySelector('.destroy-more-button')) return;
    const button = document.createElement('button');
    button.className = 'destroy-more-button';
    button.type = 'button';
    button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span>Ještě víc mě znič</span>';
    button.addEventListener('click', () => destroyMore(button));
    const newScan = actions.querySelector('.new-scan-button');
    actions.insertBefore(button, newScan || null);
  }

  function showSecondaryDiagnosis(token) {
    clearTimeout(diagnosisTimer);
    diagnosisTimer = window.setTimeout(() => {
      if (token !== resultRun || elements.result.classList.contains('hidden')) return;
      const content = elements.result.querySelector('.result-content');
      const actions = elements.result.querySelector('.result-actions');
      if (!content || content.querySelector('.secondary-diagnosis')) return;
      const box = document.createElement('aside');
      box.className = 'secondary-diagnosis';
      box.innerHTML = `<strong>⚠️ DODATEČNÝ NÁLEZ</strong><p>${secondaryDiagnoses[randomIndex(secondaryDiagnoses.length)]}</p>`;
      content.insertBefore(box, actions || null);
    }, reducedMotion() ? 250 : 1750);
  }

  function addWarpMeter() {
    const visual = elements.result.querySelector('.result-visual');
    if (!visual || visual.querySelector('.warp-meter')) return;
    const meter = document.createElement('div');
    meter.className = 'warp-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = '<span>DEFORMACE</span><strong>0%</strong><i></i>';
    visual.appendChild(meter);
  }

  function resetForResult() {
    if (elements.result.classList.contains('hidden')) return;
    const visual = elements.result.querySelector('.result-visual');
    if (!visual) return;
    const signature = `${state.lastAnalysisResult?.title || ''}|${String(state.currentImageData || '').slice(-20)}`;
    if (elements.result.dataset.experienceSignature === signature) return;
    elements.result.dataset.experienceSignature = signature;
    extraDamage = 0;
    resultRun += 1;
    addDestroyButton();
    addWarpMeter();
    showSecondaryDiagnosis(resultRun);
  }

  const resultObserver = new MutationObserver(() => requestAnimationFrame(resetForResult));
  resultObserver.observe(elements.result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const scanBar = document.querySelector('#scanBar .scan-bar-fill');
  const scanStatus = document.getElementById('scanStatus');
  if (scanBar) {
    const scanObserver = new MutationObserver(() => {
      const width = Math.max(0, Math.min(100, Number.parseFloat(scanBar.style.width) || 0));
      document.documentElement.style.setProperty('--scan-progress', `${width}%`);
      if (scanStatus) scanStatus.dataset.progress = `${Math.round(width)}%`;
    });
    scanObserver.observe(scanBar, { attributes: true, attributeFilter: ['style'] });
  }

  resetForResult();
})();
