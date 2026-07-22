(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const elements = {
    app: $('app'),
    video: $('video'),
    canvas: $('canvas'),
    cameraStage: $('cameraStage'),
    cameraIdle: $('cameraIdle'),
    switchCameraButton: $('switchCameraButton'),
    captureButton: $('captureButton'),
    retakeButton: $('retakeButton'),
    analyzeButton: $('analyzeButton'),
    result: $('result'),
    resultBackdrop: $('resultBackdrop'),
    loading: $('loading'),
    previewContainer: $('previewContainer'),
    preview: $('preview'),
    cameraError: $('cameraError'),
    uploadButton: $('uploadButton'),
    uploadInput: $('uploadInput'),
    generalError: $('generalError'),
    scanHint: $('scanHint'),
    installButton: $('installButton')
  };

  const fallbackResponses = [
    {
      category: 'Svěží podezřele moc',
      description: 'AI kouká, mžourá a hlásí: dneska to ještě držíš pohromadě. Skoro až podezřelé.'
    },
    {
      category: 'Lehce rozhozený kompas',
      description: 'Směr domů znáš, jen ho mozek kreslí trochu klikatě. Hydratace by nebyla špatná zápletka.'
    },
    {
      category: 'Afterparty archeolog',
      description: 'V obličeji máš příběh, který by radši neměl mít pokračování. Meme potenciál slušný.'
    }
  ];

  const weekdayForms = [
    { nominative: 'neděle', accusative: 'neděli', adjective: 'nedělní', classic: 'Klasická neděle' },
    { nominative: 'pondělí', accusative: 'pondělí', adjective: 'pondělní', classic: 'Klasický pondělí' },
    { nominative: 'úterý', accusative: 'úterý', adjective: 'úterní', classic: 'Klasický úterý' },
    { nominative: 'středa', accusative: 'středu', adjective: 'středeční', classic: 'Klasická středa' },
    { nominative: 'čtvrtek', accusative: 'čtvrtek', adjective: 'čtvrteční', classic: 'Klasickej čtvrtek' },
    { nominative: 'pátek', accusative: 'pátek', adjective: 'páteční', classic: 'Klasickej pátek' },
    { nominative: 'sobota', accusative: 'sobotu', adjective: 'sobotní', classic: 'Klasická sobota' }
  ];

  const dayNominativePattern = 'pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle';
  const dayAccusativePattern = 'pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli';
  const dayAdjectivePattern = 'pondělní|úterní|středeční|čtvrteční|páteční|sobotní|nedělní';

  const state = {
    currentImageData: null,
    effectImageData: null,
    effectSeverity: 0,
    cameraStream: null,
    lastAnalysisResult: { title: '', description: '', severity: 0 },
    responseLibrary: [],
    isAnalyzing: false,
    lastCategory: '',
    facingMode: 'user',
    cameraRequestId: 0,
    shareImagePromise: Promise.resolve(),
    deferredInstallPrompt: null
  };

  function capitalizeFirst(text) {
    const value = String(text || '');
    return value ? value.charAt(0).toLocaleUpperCase('cs-CZ') + value.slice(1) : value;
  }

  function preserveInitialCase(replacement, originalMatch) {
    const first = originalMatch?.charAt(0) || '';
    return first === first.toLocaleUpperCase('cs-CZ') ? capitalizeFirst(replacement) : replacement;
  }

  function getTodayForms(date = new Date()) {
    return weekdayForms[date.getDay()] || weekdayForms[0];
  }

  function syncWeekdayText(text) {
    const today = getTodayForms();

    return String(text || '')
      .replace(new RegExp(`\\bKlasick(?:ej|ý|á)\\s+(?:${dayNominativePattern})\\b`, 'gi'), (match) => preserveInitialCase(today.classic, match))
      .replace(new RegExp(`\\bIdeální trojkombinace pro\\s+(?:${dayAccusativePattern})\\b`, 'gi'), (match) => preserveInitialCase(`Ideální trojkombinace pro ${today.accusative}`, match))
      .replace(new RegExp(`\\bpro\\s+(?:${dayAccusativePattern})\\b`, 'gi'), (match) => preserveInitialCase(`pro ${today.accusative}`, match))
      .replace(new RegExp(`\\bv\\s+(?:${dayAccusativePattern})\\b`, 'gi'), (match) => preserveInitialCase(`v ${today.accusative}`, match))
      .replace(new RegExp(`\\b(?:${dayAdjectivePattern})\\b`, 'gi'), (match) => preserveInitialCase(today.adjective, match))
      .replace(new RegExp(`\\b(?:${dayNominativePattern})\\b`, 'gi'), (match) => preserveInitialCase(today.nominative, match));
  }

  function hide(element) {
    element?.classList.add('hidden');
  }

  function show(element) {
    element?.classList.remove('hidden');
  }

  function hideResult({ restoreFocus = false } = {}) {
    hide(elements.result);
    hide(elements.resultBackdrop);
    document.body.classList.remove('result-open');
    if (elements.app) elements.app.inert = false;

    if (restoreFocus) {
      const target = !elements.retakeButton.classList.contains('hidden')
        ? elements.retakeButton
        : elements.analyzeButton;
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
  }

  function showResult() {
    show(elements.resultBackdrop);
    show(elements.result);
    document.body.classList.add('result-open');
    if (elements.app) elements.app.inert = true;
    elements.result.scrollTop = 0;
  }

  function setBusy(isBusy) {
    state.isAnalyzing = isBusy;
    elements.app?.setAttribute('aria-busy', String(isBusy));
    elements.analyzeButton.disabled = isBusy;
    elements.retakeButton.disabled = isBusy;
    elements.uploadButton.disabled = isBusy;
    elements.captureButton.disabled = isBusy;
    elements.switchCameraButton.disabled = isBusy;
  }

  function showError(message, target = elements.generalError) {
    if (!target) return;
    target.textContent = message;
    show(target);
  }

  function clearErrors() {
    hide(elements.generalError);
    hide(elements.cameraError);
  }

  function setHint(message) {
    if (elements.scanHint) elements.scanHint.textContent = message;
  }

  async function fetchResponsePack(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadResponses() {
    try {
      let data;
      try {
        data = await fetchResponsePack('responses.json');
      } catch (primaryError) {
        console.warn('Hlavní balíček hlášek není dostupný:', primaryError);
        data = await fetchResponsePack('responses-extra.js');
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('responses.json je prázdný nebo nemá správný formát');
      }

      state.responseLibrary = data.filter((item) => item?.category && item?.description);
      if (state.responseLibrary.length === 0) throw new Error('Žádná použitelná hláška');
    } catch (error) {
      console.warn('Používám záložní hlášky:', error);
      state.responseLibrary = fallbackResponses;
      showError('Nepovedlo se načíst všechny hlášky. Jedu nouzový režim, žádná panika.');
    }
  }

  async function updateCameraSwitcher() {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === 'videoinput');
      videoInputs.length > 1 ? show(elements.switchCameraButton) : hide(elements.switchCameraButton);
    } catch (error) {
      console.warn('Seznam kamer není dostupný:', error);
    }
  }

  async function initCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showError('Tenhle prohlížeč neumí otevřít kameru. Nahraj fotku ručně.', elements.cameraError);
      show(elements.uploadButton);
      return;
    }

    const requestId = state.cameraRequestId + 1;
    state.cameraRequestId = requestId;
    stopCamera({ invalidateRequest: false });
    elements.cameraStage?.classList.remove('is-live');
    elements.cameraStage?.classList.toggle('is-user-facing', state.facingMode === 'user');
    elements.video.style.display = 'block';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });

      if (requestId !== state.cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      state.cameraStream = stream;
      elements.video.srcObject = stream;
      await elements.video.play().catch(() => undefined);
      elements.cameraStage?.classList.add('is-live');
      clearErrors();
      show(elements.uploadButton);
      await updateCameraSwitcher();
      setHint('Kamera běží. Dej obličej do středu a spusť sken.');
    } catch (error) {
      if (requestId !== state.cameraRequestId) return;
      console.error('Kamera nejde spustit:', error);
      elements.cameraStage?.classList.remove('is-live');
      showError('Kamera nechce spolupracovat. Povol oprávnění, nebo nahraj fotku ručně.', elements.cameraError);
      show(elements.uploadButton);
      setHint('Bez kamery můžeš použít nahrání fotky.');
    }
  }

  function stopCamera({ invalidateRequest = true } = {}) {
    if (invalidateRequest) state.cameraRequestId += 1;
    state.cameraStream?.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    elements.video.srcObject = null;
    elements.cameraStage?.classList.remove('is-live');
  }

  function setCurrentImageData(dataUrl) {
    state.currentImageData = dataUrl;
    if (dataUrl && elements.preview) {
      elements.preview.src = dataUrl;
      show(elements.previewContainer);
      elements.cameraStage?.classList.add('has-preview');
    }
  }

  function clearCurrentImage() {
    state.currentImageData = null;
    state.effectImageData = null;
    state.effectSeverity = 0;
    elements.preview.removeAttribute('src');
    hide(elements.previewContainer);
    elements.cameraStage?.classList.remove('has-preview');
  }

  function showCapturedFrame() {
    stopCamera();
    elements.video.style.display = 'none';
    show(elements.previewContainer);
    elements.cameraStage?.classList.add('has-preview');
    hide(elements.switchCameraButton);
  }

  function captureCurrentFrame(quality = 0.92) {
    if (!elements.video.videoWidth || !elements.video.videoHeight) return null;

    const context = elements.canvas.getContext('2d');
    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    context.save();
    if (state.facingMode === 'user') {
      context.translate(elements.canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(elements.video, 0, 0, elements.canvas.width, elements.canvas.height);
    context.restore();

    const dataUrl = elements.canvas.toDataURL('image/jpeg', quality);
    setCurrentImageData(dataUrl);
    return dataUrl;
  }

  function getRandomResult() {
    const library = state.responseLibrary.length ? state.responseLibrary : fallbackResponses;
    if (library.length === 1) return library[0];

    const randomIndex = () => {
      if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * library.length);
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return value[0] % library.length;
    };

    let result = library[randomIndex()];
    let guard = 0;
    while (result.category === state.lastCategory && guard < 5) {
      result = library[randomIndex()];
      guard += 1;
    }
    state.lastCategory = result.category;
    return result;
  }

  function getResultSeverity(result) {
    const library = state.responseLibrary.length ? state.responseLibrary : fallbackResponses;
    const index = library.findIndex((item) => (
      item.category === result.category && item.description === result.description
    ));
    const position = index >= 0 && library.length > 1 ? index / (library.length - 1) : 0.5;
    const category = String(result.category || '').toLocaleLowerCase('cs-CZ');
    let severity = Math.round(16 + position * 78);

    if (/startovní|svěží|čistá lajna|mikrotrip/.test(category)) severity = Math.min(severity, 29);
    if (/vypnutej|pekla|úpadek|rozpad|kyselina|dávkovací omyl/.test(category)) severity = Math.max(severity, 84);

    return Math.max(12, Math.min(98, severity));
  }

  function getEffectProfile(severity) {
    if (severity < 30) return { key: 'soft', label: 'Lehký rozklad' };
    if (severity < 58) return { key: 'wobble', label: 'Rozhozená realita' };
    if (severity < 82) return { key: 'melt', label: 'Obličej teče' };
    return { key: 'critical', label: 'Totální rozpad' };
  }

  function iconForCategory(category = '') {
    const lowered = category.toLowerCase();
    if (lowered.includes('detox') || lowered.includes('hydrat')) return '💧';
    if (lowered.includes('boss') || lowered.includes('legenda')) return '👑';
    if (lowered.includes('404') || lowered.includes('glitch')) return '⁉️';
    if (lowered.includes('zombie') || lowered.includes('duch')) return '🧟';
    if (lowered.includes('vesmír') || lowered.includes('trip') || lowered.includes('astrál')) return '🌌';
    if (lowered.includes('kebab')) return '🥙';
    if (lowered.includes('třes') || lowered.includes('rozklep')) return '🥶';
    if (lowered.includes('anděl')) return '👼';
    if (lowered.includes('orloj') || lowered.includes('čas')) return '🕰️';
    return '🔎';
  }

  function displayResult(result, severity, effectImageData) {
    const category = syncWeekdayText(result.category || 'Neznámý stav');
    const description = syncWeekdayText(result.description || 'AI se tváří tajemně a odmítá vypovídat.');
    const emoji = iconForCategory(category);
    const todayLabel = capitalizeFirst(getTodayForms().nominative);
    const effectProfile = getEffectProfile(severity);

    state.lastAnalysisResult = { title: category, description, severity };
    elements.result.replaceChildren();

    const closeButton = document.createElement('button');
    closeButton.className = 'result-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Zavřít výsledek');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => hideResult({ restoreFocus: true }));

    const content = document.createElement('div');
    content.className = 'result-content';

    const badge = document.createElement('div');
    badge.className = 'result-badge';
    badge.textContent = `Scan • ${todayLabel}`;

    const resultVisual = document.createElement('figure');
    resultVisual.className = `result-visual effect-${effectProfile.key}`;
    resultVisual.style.setProperty('--effect-strength', String(severity / 100));

    const effectImage = document.createElement('img');
    effectImage.src = effectImageData || state.currentImageData;
    effectImage.alt = `Deformovaný náhled po skenu. Intenzita efektu ${severity} procent.`;

    const effectNoise = document.createElement('span');
    effectNoise.className = 'effect-noise';
    effectNoise.setAttribute('aria-hidden', 'true');

    const effectLabel = document.createElement('figcaption');
    effectLabel.className = 'effect-label';
    effectLabel.innerHTML = `<span>${effectProfile.label}</span><strong>${severity}%</strong>`;

    resultVisual.append(effectImage, effectNoise, badge, effectLabel);

    const title = document.createElement('h2');
    title.id = 'resultTitle';
    title.textContent = `${emoji} ${category}`;

    const text = document.createElement('p');
    text.className = 'description';
    text.textContent = description;

    const shareButton = document.createElement('button');
    shareButton.id = 'shareResultButton';
    shareButton.className = 'share-button';
    shareButton.type = 'button';
    shareButton.innerHTML = '<span class="button-icon" aria-hidden="true">🚀</span><span>Sdílet / stáhnout</span>';
    shareButton.addEventListener('click', shareResult);

    const newScanButton = document.createElement('button');
    newScanButton.className = 'new-scan-button';
    newScanButton.type = 'button';
    newScanButton.innerHTML = '<span class="button-icon" aria-hidden="true">↻</span><span>Nový sken</span>';
    newScanButton.addEventListener('click', startNewScan);

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.append(shareButton, newScanButton);

    content.append(resultVisual, title, text, actions);
    elements.result.setAttribute('aria-labelledby', title.id);
    elements.result.append(closeButton, content);
    showResult();
    state.shareImagePromise = prepareShareImage(category, description, effectImageData, severity);
    triggerConfetti();
    window.requestAnimationFrame(() => {
      closeButton.focus({ preventScroll: true });
    });
  }

  function runAnalysis(options = {}) {
    if (state.isAnalyzing) return;

    if (!state.currentImageData && !options.skipImageCheck) {
      showError('Nejdřív spusť sken, vyfoť obličej nebo nahraj fotku. Bez materiálu AI jen dramaticky kouká do zdi.');
      return;
    }

    clearErrors();
    hideResult();
    hide(elements.analyzeButton);
    show(elements.loading);
    setBusy(true);
    setHint('AI simuluje brutálně seriózní analýzu…');

    const delay = 950 + Math.round(Math.random() * 650);
    window.setTimeout(async () => {
      const result = getRandomResult();
      const severity = getResultSeverity(result);
      let effectImageData = state.currentImageData;

      try {
        effectImageData = await createMeltedEffect(state.currentImageData, severity);
      } catch (error) {
        console.warn('Deformace náhledu selhala, používám původní fotku:', error);
      }

      state.effectSeverity = severity;
      state.effectImageData = effectImageData;
      displayResult(result, severity, effectImageData);
      hide(elements.loading);
      setBusy(false);
      setHint('Hotovo. Můžeš dát další sken nebo rovnou sdílet výsledek.');
    }, delay);
  }

  function triggerConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelector('.confetti-layer')?.remove();
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    const colors = ['#22d3ee', '#34d399', '#ffffff', '#fb7185'];

    for (let index = 0; index < 44; index += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${4 + Math.random() * 92}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty('--fall-delay', `${Math.random() * 0.32}s`);
      piece.style.setProperty('--fall-duration', `${1.7 + Math.random() * 1.15}s`);
      piece.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
      piece.style.setProperty('--spin', `${-540 + Math.random() * 1080}deg`);
      layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 3400);
  }

  function drawCoverImage(ctx, image, x, y, width, height) {
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

    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function seededNoise(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function createMeltedEffect(imageData, severity) {
    if (!imageData) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onerror = () => reject(new Error('Zdroj efektu se nepovedlo dekódovat'));
      image.onload = () => {
        try {
          const width = 720;
          const height = 960;
          const intensity = Math.max(0.12, Math.min(0.98, severity / 100));
          const source = document.createElement('canvas');
          const output = document.createElement('canvas');
          source.width = output.width = width;
          source.height = output.height = height;

          const sourceContext = source.getContext('2d');
          const context = output.getContext('2d');
          drawCoverImage(sourceContext, image, 0, 0, width, height);
          context.drawImage(source, 0, 0);

          const ghostOffset = Math.round(3 + intensity * 18);
          context.save();
          context.globalCompositeOperation = 'screen';
          context.globalAlpha = 0.035 + intensity * 0.13;
          context.drawImage(source, ghostOffset, -2);
          context.drawImage(source, -ghostOffset, 3);
          context.restore();

          const left = Math.round(width * 0.14);
          const right = Math.round(width * 0.86);
          const center = width / 2;
          const radius = (right - left) / 2;
          const meltTop = Math.round(height * 0.19);
          const meltHeight = Math.round(height * 0.57);
          const sliceWidth = severity >= 82 ? 5 : 7;

          for (let x = left; x < right; x += sliceWidth) {
            const normalizedX = (x - center) / radius;
            const faceMask = Math.pow(Math.max(0, 1 - normalizedX * normalizedX), 1.35);
            const noise = seededNoise(x * 0.37 + severity * 2.11);
            const pull = Math.round(
              height * (0.012 + intensity * intensity * 0.19) * faceMask * (0.28 + noise * 0.72)
            );
            if (pull < 2) continue;

            const sourceY = meltTop + Math.round(noise * 20 * intensity);
            const sourceHeight = Math.min(meltHeight, height - sourceY);
            const wobble = Math.round(
              Math.sin(x * 0.045 + severity) * (2 + intensity * 11) * faceMask
            );

            context.drawImage(
              source,
              x,
              sourceY,
              sliceWidth,
              sourceHeight,
              x + wobble,
              sourceY,
              sliceWidth + 1,
              sourceHeight + pull
            );
          }

          if (severity >= 42) {
            const tearCount = 3 + Math.round(intensity * 6);
            for (let index = 0; index < tearCount; index += 1) {
              const noise = seededNoise(severity * 9.7 + index * 17.3);
              const y = Math.round(height * (0.22 + noise * 0.52));
              const stripeHeight = 4 + Math.round(seededNoise(index + severity) * (9 + intensity * 15));
              const shift = Math.round((seededNoise(index * 4.3 + severity) - 0.5) * 90 * intensity);
              context.globalAlpha = 0.46 + intensity * 0.36;
              context.drawImage(source, 0, y, width, stripeHeight, shift, y + index % 3, width, stripeHeight);
            }
            context.globalAlpha = 1;
          }

          if (severity >= 68) {
            const dripCount = 5 + Math.round(intensity * 7);
            for (let index = 0; index < dripCount; index += 1) {
              const noise = seededNoise(severity * 4.9 + index * 23.1);
              const dripX = Math.round(width * (0.26 + noise * 0.48));
              const dripWidth = 5 + Math.round(seededNoise(index + 11.4) * 13);
              const dripY = Math.round(height * (0.55 + seededNoise(index * 8.2) * 0.12));
              const dripLength = Math.round(height * (0.05 + seededNoise(index + severity * 0.3) * 0.15) * intensity);
              context.globalAlpha = 0.62;
              context.drawImage(source, dripX, dripY - 9, dripWidth, 18, dripX, dripY, dripWidth, dripLength);
            }
            context.globalAlpha = 1;
          }

          const colorWash = context.createLinearGradient(0, 0, width, height);
          colorWash.addColorStop(0, `rgba(34, 211, 238, ${0.025 + intensity * 0.08})`);
          colorWash.addColorStop(0.52, 'rgba(2, 6, 23, 0)');
          colorWash.addColorStop(1, `rgba(244, 63, 94, ${0.02 + intensity * 0.12})`);
          context.fillStyle = colorWash;
          context.fillRect(0, 0, width, height);

          const vignette = context.createRadialGradient(width / 2, height * 0.43, height * 0.12, width / 2, height * 0.46, height * 0.69);
          vignette.addColorStop(0, 'rgba(2, 6, 23, 0)');
          vignette.addColorStop(1, `rgba(2, 6, 23, ${0.2 + intensity * 0.24})`);
          context.fillStyle = vignette;
          context.fillRect(0, 0, width, height);

          resolve(output.toDataURL('image/jpeg', 0.9));
        } catch (error) {
          reject(error);
        }
      };

      image.src = imageData;
    });
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);

    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1].replace(/[.,!?…]*$/, '')}…`;
    }

    visibleLines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
    return visibleLines.length * lineHeight;
  }

  function prepareShareImage(title, description, effectImageData, severity) {
    return new Promise((resolve) => {
      const ctx = elements.canvas.getContext('2d');
      const image = new Image();
      const width = 1080;
      const imageHeight = 900;
      const panelHeight = 450;

      const drawBase = () => {
        elements.canvas.width = width;
        elements.canvas.height = imageHeight + panelHeight;

        const gradient = ctx.createLinearGradient(0, 0, width, elements.canvas.height);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(0.55, '#071426');
        gradient.addColorStop(1, '#020617');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
      };

      const drawPhotoOverlay = () => {
        const vignette = ctx.createRadialGradient(width / 2, imageHeight * 0.42, 120, width / 2, imageHeight * 0.45, 690);
        vignette.addColorStop(0, 'rgba(2, 6, 23, 0)');
        vignette.addColorStop(1, 'rgba(2, 6, 23, 0.62)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, imageHeight);

        ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 90) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, imageHeight);
          ctx.stroke();
        }
        for (let y = 0; y <= imageHeight; y += 90) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.fillRect(42, 42, 306, 58);
        ctx.fillStyle = '#67e8f9';
        ctx.font = '800 24px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SMŽK / DAMAGE ${severity}%`, 64, 80);
      };

      const finish = () => {
        drawPhotoOverlay();
        drawResultPanel(ctx, title, description, imageHeight, width, panelHeight);
        resolve();
      };

      image.onload = () => {
        drawBase();
        drawCoverImage(ctx, image, 0, 0, width, imageHeight);
        finish();
      };

      image.onerror = () => {
        drawBase();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
        ctx.fillRect(0, 0, width, imageHeight);
        ctx.fillStyle = '#f4f7f6';
        ctx.font = '800 72px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Jsem smažka?', width / 2, imageHeight / 2);
        finish();
      };

      if (effectImageData || state.currentImageData) image.src = effectImageData || state.currentImageData;
      else image.onerror();
    });
  }

  function drawResultPanel(ctx, title, description, top, width, height) {
    const todayLabel = capitalizeFirst(getTodayForms().nominative).toLocaleUpperCase('cs-CZ');

    ctx.fillStyle = 'rgba(2, 6, 23, 0.97)';
    ctx.fillRect(0, top, width, height);

    const accent = ctx.createLinearGradient(0, top, width, top);
    accent.addColorStop(0, '#22d3ee');
    accent.addColorStop(1, '#34d399');
    ctx.fillStyle = accent;
    ctx.fillRect(0, top, width, 8);

    ctx.fillStyle = '#67e8f9';
    ctx.font = '700 28px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`LOKÁLNÍ AI DETEKCE DEVASTACE • ${todayLabel}`, width / 2, top + 58);

    ctx.fillStyle = '#ffffff';
    let titleSize = 66;
    ctx.font = `800 ${titleSize}px Segoe UI, sans-serif`;
    while (ctx.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      ctx.font = `800 ${titleSize}px Segoe UI, sans-serif`;
    }
    ctx.fillText(title, width / 2, top + 145);

    ctx.fillStyle = '#d9e1df';
    ctx.font = 'italic 38px Segoe UI, sans-serif';
    wrapText(ctx, description, width / 2, top + 220, width - 130, 48, 3);

    ctx.fillStyle = 'rgba(217, 225, 223, 0.5)';
    ctx.font = '28px Segoe UI, sans-serif';
    ctx.fillText('jsemsmazka.cz • jen pro srandu, ne diagnóza', width / 2, top + height - 52);
  }

  async function shareResult() {
    try {
      await state.shareImagePromise;
      const blob = await new Promise((resolve) => elements.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Canvas nevytvořil obrázek');

      const file = new File([blob], 'jsem-smazka-vysledek.png', { type: 'image/png' });
      const shareData = {
        title: `Jsem ${state.lastAnalysisResult.title}!`,
        text: `${state.lastAnalysisResult.description} Zkus si sken taky.`,
        files: [file]
      };

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        return;
      }

      downloadBlob(blob);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Sdílení selhalo:', error);
      showError('Sdílení se nepovedlo, zkus to ještě jednou. Mobil si asi taky dává detox.');
    }
  }

  function downloadBlob(blob) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'jsem-smazka-vysledek.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function optimizeUploadedImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Soubor se nepovedlo přečíst'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Obrázek se nepovedlo dekódovat'));
        image.onload = () => {
          const maxDimension = 1800;
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleUploadedFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Nahraj prosím obrázek, třeba JPEG nebo PNG. PDF s obličejem ještě neumíme, nejsme FBI.');
      return;
    }

    elements.uploadButton.disabled = true;
    elements.analyzeButton.disabled = true;

    try {
      const imageData = await optimizeUploadedImage(file);
      setCurrentImageData(imageData);
      showCapturedFrame();
      hide(elements.captureButton);
      show(elements.retakeButton);
      show(elements.analyzeButton);
      hideResult();
      clearErrors();
      runAnalysis();
    } catch (error) {
      console.error('Fotka se nepovedla načíst:', error);
      showError('Fotka se nepovedla načíst. Zkus jinou.');
      elements.uploadButton.disabled = false;
      elements.analyzeButton.disabled = false;
    }
  }

  elements.captureButton.addEventListener('click', () => {
    const dataUrl = captureCurrentFrame(0.9);
    if (!dataUrl) {
      showError('Kamera ještě neposlala obraz. Dej jí vteřinu a zkus to znovu.');
      return;
    }

    showCapturedFrame();
    hide(elements.captureButton);
    show(elements.retakeButton);
    show(elements.analyzeButton);
    hideResult();
    clearErrors();
  });

  elements.uploadButton.addEventListener('click', () => elements.uploadInput.click());
  elements.uploadInput.addEventListener('change', (event) => {
    handleUploadedFile(event.target.files?.[0]);
    elements.uploadInput.value = '';
  });

  async function startNewScan() {
    hideResult();
    window.SmazkaFaceScan?.reset?.();
    clearCurrentImage();
    hide(elements.retakeButton);
    show(elements.analyzeButton);
    clearErrors();
    await initCamera();
    elements.analyzeButton.focus({ preventScroll: true });
  }

  elements.retakeButton.addEventListener('click', startNewScan);

  elements.switchCameraButton.addEventListener('click', async () => {
    window.SmazkaFaceScan?.reset?.();
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    clearCurrentImage();
    hideResult();
    show(elements.analyzeButton);
    await initCamera();
  });

  elements.analyzeButton.addEventListener('click', () => {
    if (window.SmazkaFaceScan?.start) {
      window.SmazkaFaceScan.start();
      return;
    }
    runAnalysis();
  });

  elements.resultBackdrop.addEventListener('click', () => hideResult({ restoreFocus: true }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.result.classList.contains('hidden')) {
      hideResult({ restoreFocus: true });
    }
  });

  window.SmazkaApp = {
    elements,
    state,
    initCamera,
    stopCamera,
    captureCurrentFrame,
    setCurrentImageData,
    clearCurrentImage,
    showCapturedFrame,
    runAnalysis,
    showError,
    clearErrors,
    hideResult,
    setHint,
    setBusy,
    syncWeekdayText,
    getTodayForms
  };

  window.addEventListener('pagehide', () => stopCamera());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.currentImageData) {
      stopCamera();
      return;
    }

    if (!document.hidden && !state.currentImageData && !state.cameraStream) {
      initCamera();
    }
  });

  navigator.mediaDevices?.addEventListener?.('devicechange', updateCameraSwitcher);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    show(elements.installButton);
  });

  elements.installButton.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    hide(elements.installButton);
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    hide(elements.installButton);
  });

  const canRegisterServiceWorker = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && canRegisterServiceWorker) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .then((registration) => registration?.update())
        .catch((error) => {
          console.warn('Service worker registrace selhala:', error);
        });
    });
  }

  loadResponses();
  initCamera();
})();
