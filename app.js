(() => {
  'use strict';

  /*
   * Incremental UI layers used to create their own MutationObserver. Keep their
   * public observer contract, but multiplex every subscription through one
   * native observer so a result render does not trigger dozens of independent
   * DOM walks.
   */
  (() => {
    const NativeMutationObserver = window.MutationObserver;
    if (typeof NativeMutationObserver !== 'function' || window.SmazkaMutationObserver) return;

    const logicalObservers = new Set();
    let nativeObserver = null;

    function containsTarget(root, target, subtree) {
      return root === target || Boolean(subtree && root?.contains?.(target));
    }

    function acceptsRecord(options, record) {
      if (record.type === 'attributes') {
        return Boolean(
          options.attributes
          && (
            !Array.isArray(options.attributeFilter)
            || options.attributeFilter.includes(record.attributeName)
          )
        );
      }
      if (record.type === 'characterData') return Boolean(options.characterData);
      return record.type === 'childList' && Boolean(options.childList);
    }

    function dispatchRecords(records) {
      logicalObservers.forEach((observer) => {
        if (!observer.targets.size) return;
        const relevant = records.filter((record) => (
          [...observer.targets].some(([target, options]) => (
            containsTarget(target, record.target, options.subtree)
            && acceptsRecord(options, record)
          ))
        ));
        if (!relevant.length) return;
        try {
          observer.callback(relevant, observer);
        } catch (error) {
          window.setTimeout(() => { throw error; }, 0);
        }
      });
    }

    function mergeOptions(entries) {
      const merged = {
        attributes: false,
        characterData: false,
        childList: false,
        subtree: false
      };
      const filters = new Set();
      let observeAllAttributes = false;

      entries.forEach((options) => {
        merged.attributes ||= Boolean(options.attributes);
        merged.characterData ||= Boolean(options.characterData);
        merged.childList ||= Boolean(options.childList);
        merged.subtree ||= Boolean(options.subtree);
        merged.attributeOldValue ||= Boolean(options.attributeOldValue);
        merged.characterDataOldValue ||= Boolean(options.characterDataOldValue);
        if (options.attributes) {
          if (Array.isArray(options.attributeFilter)) {
            options.attributeFilter.forEach((name) => filters.add(name));
          } else {
            observeAllAttributes = true;
          }
        }
      });

      if (merged.attributes && !observeAllAttributes && filters.size) {
        merged.attributeFilter = [...filters];
      }
      return merged;
    }

    function rebuildNativeObserver() {
      nativeObserver?.disconnect();
      const targetOptions = new Map();

      logicalObservers.forEach((observer) => {
        observer.targets.forEach((options, target) => {
          const entries = targetOptions.get(target) || [];
          entries.push(options);
          targetOptions.set(target, entries);
        });
      });

      if (!targetOptions.size) return;
      if (!nativeObserver) nativeObserver = new NativeMutationObserver(dispatchRecords);
      targetOptions.forEach((entries, target) => {
        nativeObserver.observe(target, mergeOptions(entries));
      });
    }

    class SharedMutationObserver {
      constructor(callback) {
        if (typeof callback !== 'function') {
          throw new TypeError('MutationObserver callback musí být funkce.');
        }
        this.callback = callback;
        this.targets = new Map();
        logicalObservers.add(this);
      }

      observe(target, options = {}) {
        if (!target) throw new TypeError('MutationObserver target chybí.');
        logicalObservers.add(this);
        this.targets.set(target, { ...options });
        rebuildNativeObserver();
      }

      disconnect() {
        this.targets.clear();
        logicalObservers.delete(this);
        rebuildNativeObserver();
      }

      takeRecords() {
        return [];
      }
    }

    window.SmazkaMutationObserver = SharedMutationObserver;
  })();

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
      id: 'fallback_podezrele_funkcni_exemplar',
      category: 'Podezřele funkční exemplář',
      description: 'Ksicht drží, oči komunikují a důstojnost ještě nebyla prohlášena za nezvěstnou. Tohle smrdí podvodem.',
      severity: { min: 12, max: 34 },
      effect: 'soft-drift',
      signals: []
    },
    {
      id: 'fallback_clovek_v_nouzovym_rezimu',
      category: 'Člověk v nouzovým režimu',
      description: 'Hardware zatím stojí. Software ale otevřel dveře, odešel do nonstopu a nevrátil klíče.',
      severity: { min: 40, max: 68 },
      effect: 'facial-drift',
      signals: ['pose', 'asymmetry']
    },
    {
      id: 'fallback_ranni_dukazni_material',
      category: 'Ranní důkazní materiál',
      description: 'V obličeji máš tolik stop, že by ho kriminálka zabalila do sáčku. Ty tomu pořád říkáš povedenej večer.',
      severity: { min: 70, max: 98 },
      effect: 'deep-collapse',
      signals: ['sharpness', 'exposure', 'stability']
    }
  ];

  const effectProfiles = Object.freeze({
    'soft-drift': { key: 'soft-drift', label: 'Jemný posun proporcí', tone: 'soft' },
    'late-night': { key: 'late-night', label: 'Únava obličeje', tone: 'soft' },
    'micro-asymmetry': { key: 'micro-asymmetry', label: 'Mírná asymetrie', tone: 'wobble' },
    'facial-drift': { key: 'facial-drift', label: 'Posun proporcí', tone: 'wobble' },
    'cheek-pressure': { key: 'cheek-pressure', label: 'Tlak v oblasti tváří', tone: 'wobble' },
    'jaw-offset': { key: 'jaw-offset', label: 'Nestabilní čelist', tone: 'wobble' },
    'lens-bloom': { key: 'lens-bloom', label: 'Širokoúhlá deformace', tone: 'lens' },
    'signal-glitch': { key: 'signal-glitch', label: 'Signál se láme', tone: 'glitch' },
    'kebab-lens': { key: 'kebab-lens', label: 'Kebab lens', tone: 'lens' },
    'gravity-drop': { key: 'gravity-drop', label: 'Gravitační pokles', tone: 'melt' },
    'soft-collapse': { key: 'soft-collapse', label: 'Měkký kolaps proporcí', tone: 'melt' },
    'wide-lens': { key: 'wide-lens', label: 'Silná širokoúhlá deformace', tone: 'lens' },
    'asymmetric-drag': { key: 'asymmetric-drag', label: 'Asymetrický tah', tone: 'wobble' },
    'gravity-loss': { key: 'gravity-loss', label: 'Ztráta gravitace', tone: 'cosmic' },
    'eye-sink': { key: 'eye-sink', label: 'Propad očí', tone: 'hollow' },
    'liquid-gravity': { key: 'liquid-gravity', label: 'Tekutá gravitace', tone: 'melt' },
    'cranial-bloom': { key: 'cranial-bloom', label: 'Kraniální přetlak', tone: 'critical' },
    'deep-collapse': { key: 'deep-collapse', label: 'Hluboký kolaps', tone: 'critical' },
    'total-drift': { key: 'total-drift', label: 'Totální prostorový drift', tone: 'critical' }
  });
  const fallbackEffectProfile = effectProfiles['facial-drift'];

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
    cameraActivated: false,
    cameraInitPromise: null,
    lastAnalysisResult: { title: '', description: '', severity: 0 },
    responseLibrary: [],
    isAnalyzing: false,
    lastCategory: '',
    facingMode: 'user',
    cameraRequestId: 0,
    shareImagePromise: Promise.resolve(),
    deferredInstallPrompt: null,
    effectProfile: null,
    effectSeed: 0,
    faceAnalysis: null,
    lastDevastationMetrics: null
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
    if (elements.result?.open && typeof elements.result.close === 'function') {
      elements.result.close();
    } else {
      elements.result?.removeAttribute('open');
    }
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
    if (
      elements.result
      && !elements.result.open
      && typeof elements.result.showModal === 'function'
    ) {
      try {
        elements.result.showModal();
      } catch (error) {
        console.warn('Nativní dialog výsledku se nepovedlo otevřít:', error);
        elements.result.setAttribute('open', '');
      }
    } else if (elements.result && !elements.result.open) {
      elements.result.setAttribute('open', '');
    }
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
    if (target === elements.cameraError) {
      elements.cameraStage?.classList.add('has-camera-error');
    }
  }

  function clearErrors() {
    hide(elements.generalError);
    hide(elements.cameraError);
    elements.cameraStage?.classList.remove('has-camera-error');
    show(elements.scanHint);
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
      const data = await fetchResponsePack('responses.json');

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

  async function performCameraInit({ source = 'user' } = {}) {
    state.cameraActivated = true;
    elements.cameraStage?.setAttribute('data-camera-source', source);
    if (!navigator.mediaDevices?.getUserMedia) {
      showError('Tenhle prohlížeč neumí otevřít kameru. Nahraj fotku ručně.', elements.cameraError);
      hide(elements.cameraIdle);
      hide(elements.scanHint);
      show(elements.uploadButton);
      return;
    }

    const requestId = state.cameraRequestId + 1;
    state.cameraRequestId = requestId;
    stopCamera({ invalidateRequest: false });
    elements.cameraStage?.classList.remove('is-live');
    elements.cameraStage?.classList.toggle('is-user-facing', state.facingMode === 'user');
    show(elements.cameraIdle);
    show(elements.scanHint);
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
      const buttonText = elements.analyzeButton?.querySelector('.button-text');
      if (buttonText) buttonText.textContent = 'Spustit sken';
      clearErrors();
      show(elements.uploadButton);
      await updateCameraSwitcher();
      setHint('Portál běží. Ksicht doprostřed a spusť rozsudek.');
      return stream;
    } catch (error) {
      if (requestId !== state.cameraRequestId) return;
      console.error('Kamera nejde spustit:', error);
      elements.cameraStage?.classList.remove('is-live');
      showError('Kamera je zablokovaná. Povol ji, nebo nahraj fotku.', elements.cameraError);
      hide(elements.cameraIdle);
      hide(elements.scanHint);
      show(elements.uploadButton);
    }
  }

  function initCamera(options = {}) {
    const force = Boolean(options.force);
    if (!force && state.cameraStream) return Promise.resolve(state.cameraStream);
    if (!force && state.cameraInitPromise) return state.cameraInitPromise;

    const operation = performCameraInit(options);
    state.cameraInitPromise = operation;
    const clearOperation = () => {
      if (state.cameraInitPromise === operation) state.cameraInitPromise = null;
    };
    operation.then(clearOperation, clearOperation);
    return operation;
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
    state.faceAnalysis = null;
    state.lastDevastationMetrics = null;
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
    state.effectProfile = null;
    state.effectSeed = 0;
    state.faceAnalysis = null;
    state.lastDevastationMetrics = null;
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

  function getResultSeverity(result, measuredSeverity) {
    const measured = Number(measuredSeverity);
    if (Number.isFinite(measured)) return Math.max(12, Math.min(98, Math.round(measured)));

    const minimum = Number(result?.severity?.min);
    const maximum = Number(result?.severity?.max);
    if (Number.isFinite(minimum) && Number.isFinite(maximum) && minimum <= maximum) {
      return Math.max(12, Math.min(98, Math.round((minimum + maximum) / 2)));
    }

    return 50;
  }

  function getEffectProfile(result = {}) {
    const key = typeof result.effect === 'string' ? result.effect.trim() : '';
    return effectProfiles[key] || fallbackEffectProfile;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function ensureRevealOverlay() {
    let overlay = elements.cameraStage?.querySelector('.result-reveal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'result-reveal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <span class="result-reveal-kicker">VOID VERDICT // LOCKED</span>
      <strong class="result-reveal-title">Rozpad byl potvrzen</strong>
      <span class="result-reveal-meter"></span>
    `;
    elements.cameraStage?.appendChild(overlay);
    return overlay;
  }

  function playResultReveal(effectImageData, severity, effectProfile) {
    if (!elements.cameraStage || !effectImageData || reducedMotion()) return Promise.resolve();

    return new Promise((resolve) => {
      const overlay = ensureRevealOverlay();
      const title = overlay.querySelector('.result-reveal-title');
      const meter = overlay.querySelector('.result-reveal-meter');

      if (title) title.textContent = effectProfile?.label || 'Rozpad byl potvrzen';
      if (meter) meter.textContent = `${severity}%`;
      elements.cameraStage.style.setProperty('--reveal-strength', String(severity / 100));
      elements.preview.src = effectImageData;
      show(elements.previewContainer);
      elements.cameraStage.classList.add('is-revealing-result', `reveal-${effectProfile?.tone || 'melt'}`);
      setHint('Podsvětí tiskne rozsudek přímo do ksichtu…');

      window.setTimeout(() => {
        elements.cameraStage.classList.remove(
          'is-revealing-result',
          'reveal-soft',
          'reveal-wobble',
          'reveal-melt',
          'reveal-critical',
          'reveal-glitch',
          'reveal-cosmic',
          'reveal-hollow',
          'reveal-lens'
        );
        resolve();
      }, 980);
    });
  }

  function displayResult(result, severity, effectImageData) {
    const category = syncWeekdayText(result.category || 'Neznámý stav');
    const description = syncWeekdayText(result.description || 'AI se tváří tajemně a odmítá vypovídat.');
    const todayLabel = capitalizeFirst(getTodayForms().nominative);
    const effectProfile = getEffectProfile(result);

    state.lastAnalysisResult = {
      id: result.id || '',
      title: category,
      description,
      severity,
      effect: effectProfile.key,
      signals: Array.isArray(result.signals) ? [...result.signals] : [],
      effectProfile
    };
    state.effectProfile = effectProfile;
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
    badge.textContent = `VOID VERDIKT // ${todayLabel}`;

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
    title.textContent = category;

    const text = document.createElement('p');
    text.className = 'description';
    text.textContent = description;

    const shareButton = document.createElement('button');
    shareButton.id = 'shareResultButton';
    shareButton.className = 'share-button';
    shareButton.type = 'button';
    shareButton.innerHTML = '<span class="button-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-share"></use></svg></span><span>Sdílet / stáhnout</span>';
    shareButton.addEventListener('click', shareResult);

    const newScanButton = document.createElement('button');
    newScanButton.className = 'new-scan-button';
    newScanButton.type = 'button';
    newScanButton.innerHTML = '<span class="button-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-retry"></use></svg></span><span>Nový sken</span>';
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
    setHint('VOID engine pitvá obraz a hledá zbytky člověka…');

    const delay = 950 + Math.round(Math.random() * 650);
    window.setTimeout(async () => {
      const result = options.verdict || getRandomResult();
      const severity = getResultSeverity(result, options.severity);
      let effectProfile = getEffectProfile(result);
      let effectImageData = state.currentImageData;

      try {
        if (typeof window.SmazkaFaceWarp?.renderFaceEffect === 'function') {
          const rendered = await window.SmazkaFaceWarp.renderFaceEffect({
            imageData: state.currentImageData,
            severity,
            effect: effectProfile.key,
            faceAnalysis: state.faceAnalysis,
            output: { width: 480, height: 640, crop: 'cover' }
          });
          effectImageData = rendered.finalDataUrl;
          state.effectSeed = rendered.seed;
          effectProfile = {
            ...effectProfile,
            key: rendered.effect,
            label: rendered.label
          };
        } else {
          console.warn('Jednotný face-warp renderer není dostupný; používám původní fotku.');
        }
      } catch (error) {
        console.warn('Deformace náhledu selhala, používám původní fotku:', error);
      }

      state.effectSeverity = severity;
      state.effectImageData = effectImageData;
      state.effectProfile = effectProfile;
      hide(elements.loading);
      await playResultReveal(effectImageData, severity, effectProfile);
      displayResult(result, severity, effectImageData);
      setBusy(false);
      setHint('Rozsudek je venku. Sdílej ostudu, nebo přiveď další subjekt.');
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
    await Promise.all([
      initCamera({ source: 'new-scan' }),
      window.SmazkaFaceScan?.ensureReady?.()?.catch?.(() => undefined)
    ]);
    elements.analyzeButton.focus({ preventScroll: true });
  }

  elements.retakeButton.addEventListener('click', startNewScan);

  elements.switchCameraButton.addEventListener('click', async () => {
    window.SmazkaFaceScan?.reset?.();
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    clearCurrentImage();
    hideResult();
    show(elements.analyzeButton);
    await initCamera({ source: 'switch-camera', force: true });
  });

  elements.analyzeButton.addEventListener('click', async () => {
    if (!state.currentImageData && !state.cameraStream) {
      clearErrors();
      setHint('Probouzím lokální FACE engine. Kamera se otevře jen pro tenhle sken…');
      await Promise.all([
        initCamera({ source: 'portal-tap' }),
        window.SmazkaFaceScan?.ensureReady?.()?.catch?.(() => undefined)
      ]);
      return;
    }
    if (window.SmazkaFaceScan?.start) {
      window.SmazkaFaceScan.start();
      return;
    }
    runAnalysis();
  });

  elements.resultBackdrop.addEventListener('click', () => hideResult({ restoreFocus: true }));
  elements.result.addEventListener('cancel', (event) => {
    event.preventDefault();
    hideResult({ restoreFocus: true });
  });
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

    if (
      !document.hidden
      && state.cameraActivated
      && !state.currentImageData
      && !state.cameraStream
    ) {
      initCamera({ source: 'visibility-resume' });
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
})();
