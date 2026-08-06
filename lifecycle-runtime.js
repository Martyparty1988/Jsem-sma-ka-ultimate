/* Production runtime bundle: lifecycle-runtime.js | source order preserved. */

/* === privacy-hardening.js === */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements) return;

  const { state, elements } = app;
  const SAFE_MODE_KEY = 'smazka:auto-clear-photo';
  const originalClearCurrentImage = app.clearCurrentImage.bind(app);
  let scrubInProgress = false;
  let delayedScrubTimer = null;

  function safeModeEnabled() {
    try {
      const value = localStorage.getItem(SAFE_MODE_KEY);
      return value === null ? true : value === 'true';
    } catch {
      return true;
    }
  }

  function clearCanvas(canvas) {
    if (!canvas) return;

    try {
      const context = canvas.getContext?.('2d');
      if (context && canvas.width && canvas.height) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch {
      // A canvas can become unavailable while the page is being discarded.
    }

    if (canvas.width !== 1) canvas.width = 1;
    if (canvas.height !== 1) canvas.height = 1;
  }

  function scrubSensitiveMedia() {
    if (scrubInProgress) return;
    scrubInProgress = true;

    try {
      state.currentImageData = null;
      state.originalImageData = null;
      state.effectImageData = null;
      state.effectSeverity = 0;
      state.effectProfile = null;
      state.effectSeed = 0;
      state.effectFaceAnalysis = null;
      state.faceCrop = null;
      state.diagnosticData = null;
      state.faceAnalysis = null;
      state.lastDevastationMetrics = null;
      state.shareImagePromise = Promise.resolve();

      if (elements.preview?.hasAttribute('src')) elements.preview.removeAttribute('src');
      elements.previewContainer?.classList.add('hidden');
      elements.cameraStage?.classList.remove('has-preview');

      elements.result?.querySelectorAll('img').forEach((image) => {
        if (image.hasAttribute('src')) image.removeAttribute('src');
        if (image.hasAttribute('srcset')) image.removeAttribute('srcset');
      });

      elements.result?.querySelectorAll('canvas').forEach(clearCanvas);
      clearCanvas(elements.canvas);

      elements.result?.removeAttribute('data-diagnostic-token');
      elements.result?.removeAttribute('data-warp-token');
    } finally {
      scrubInProgress = false;
    }
  }

  function scheduleFinalScrub(pendingWork) {
    Promise.resolve(pendingWork)
      .catch(() => undefined)
      .finally(() => {
        if (safeModeEnabled() && !state.currentImageData) scrubSensitiveMedia();
      });

    window.clearTimeout(delayedScrubTimer);
    delayedScrubTimer = window.setTimeout(() => {
      if (safeModeEnabled() && !state.currentImageData) scrubSensitiveMedia();
    }, 1600);
  }

  app.clearCurrentImage = () => {
    const pendingWork = state.shareImagePromise;
    originalClearCurrentImage();
    scrubSensitiveMedia();
    scheduleFinalScrub(pendingWork);
  };

  function dataUrlToFile(dataUrl, filename) {
    const parts = String(dataUrl || '').split(',');
    const match = parts[0]?.match(/^data:([^;]+);base64$/i);
    if (!match || !parts[1]) throw new Error('Neplatný obrázek pro sdílení');

    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], filename, { type: match[1] });
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function shareOrSave(button, kind) {
    const previousMarkup = button.innerHTML;
    button.disabled = true;
    button.textContent = kind === 'original' ? 'Připravuju originál…' : 'Připravuju deformaci…';

    try {
      if (kind === 'deformed') {
        await Promise.resolve(state.shareImagePromise).catch(() => undefined);
      }

      const dataUrl = kind === 'original'
        ? state.originalImageData || state.currentImageData
        : state.effectImageData;
      if (!dataUrl) throw new Error('Fotka už není dostupná');

      const extension = String(dataUrl).startsWith('data:image/png')
        ? 'png'
        : String(dataUrl).startsWith('data:image/webp')
          ? 'webp'
          : 'jpg';
      const filename = `smazka-${kind === 'original' ? 'original' : 'deformace'}-${Date.now()}.${extension}`;
      const file = dataUrlToFile(dataUrl, filename);
      const shareData = {
        title: kind === 'original' ? 'Původní fotka ze Smažka Scanu' : 'Deformace ze Smažka Scanu',
        files: [file]
      };

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        button.textContent = 'Otevřeno sdílení ✓';
      } else {
        downloadFile(file);
        button.textContent = 'Uloženo ✓';
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('Uložení fotografie selhalo:', error);
        app.showError('Fotku se nepovedlo uložit. Zkus to ještě jednou.');
      }
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.innerHTML = previousMarkup;
      }, 800);
    }
  }

  elements.result?.addEventListener('click', (event) => {
    const button = event.target.closest?.('.result-tool-button');
    if (!button || button.disabled) return;

    const label = button.textContent || '';
    const kind = label.includes('Uložit originál')
      ? 'original'
      : label.includes('Uložit deformaci')
        ? 'deformed'
        : null;

    if (!kind) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    shareOrSave(button, kind);
  }, true);

  const hiddenResultObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    if (!safeModeEnabled()) return;
    if (!elements.result?.classList.contains('hidden')) return;
    if (state.currentImageData) return;
    queueMicrotask(scrubSensitiveMedia);
  });

  if (elements.result) {
    hiddenResultObserver.observe(elements.result, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'src', 'srcset', 'width', 'height']
    });
  }

  window.addEventListener('pagehide', () => {
    window.clearTimeout(delayedScrubTimer);
    scrubSensitiveMedia();
    hiddenResultObserver.disconnect();
  }, { once: true });

  window.SmazkaPrivacy = {
    scrubSensitiveMedia,
    safeModeEnabled
  };
})();

/* === ios-one-screen.js === */
(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const app = window.SmazkaApp;
  if (!mobileQuery.matches || !app?.elements) return;

  const { elements } = app;
  const buttonGroup = document.querySelector('.button-group');
  const topbar = document.querySelector('.topbar');
  const localStatus = topbar?.querySelector('.local-status');
  const footer = document.querySelector('footer');
  const cameraStage = elements.cameraStage;

  if (!buttonGroup || !topbar || !cameraStage) return;

  document.body.classList.add('ios-one-screen-ready');
  elements.analyzeButton?.setAttribute('aria-label', 'Spustit sken');
  elements.analyzeButton?.setAttribute('title', 'Spustit sken');

  if (elements.switchCameraButton && !elements.switchCameraButton.classList.contains('dock-camera-button')) {
    elements.switchCameraButton.classList.add('dock-camera-button');
    buttonGroup.appendChild(elements.switchCameraButton);
  }

  buttonGroup.classList.add('camera-control-dock');

  /* Keep hint and controls in the document flow directly below the camera. */
  if (elements.scanHint) {
    elements.scanHint.classList.add('camera-hint-overlay');
    if (elements.scanHint.parentElement !== cameraStage.parentElement) {
      cameraStage.insertAdjacentElement('afterend', elements.scanHint);
    }
  }

  if (buttonGroup.parentElement !== cameraStage.parentElement) {
    elements.scanHint?.insertAdjacentElement('afterend', buttonGroup);
  }

  const privacyStrip = document.querySelector('.privacy-strip');
  if (privacyStrip && privacyStrip.parentElement !== cameraStage.parentElement) {
    buttonGroup.insertAdjacentElement('afterend', privacyStrip);
  }

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'ios-settings-button';
  settingsButton.setAttribute('aria-label', 'Otevřít nastavení');
  settingsButton.setAttribute('aria-haspopup', 'dialog');
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-settings"></use></svg>';

  const topbarTools = document.createElement('div');
  topbarTools.className = 'topbar-tools';
  if (localStatus) topbarTools.appendChild(localStatus);
  topbarTools.appendChild(settingsButton);
  topbar.appendChild(topbarTools);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'ios-settings-backdrop';
  backdrop.setAttribute('aria-label', 'Zavřít nastavení');
  backdrop.tabIndex = -1;

  const sheet = document.createElement('section');
  sheet.className = 'ios-settings-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'iosSettingsTitle');
  sheet.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = 'ios-settings-header';
  header.innerHTML = '<div><strong id="iosSettingsTitle">Nastavení</strong><small>Data zůstávají v tomto zařízení.</small></div>';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ios-settings-close';
  closeButton.setAttribute('aria-label', 'Zavřít nastavení');
  closeButton.textContent = '×';
  header.appendChild(closeButton);

  const content = document.createElement('div');
  content.className = 'ios-settings-content';

  const localSettings = footer?.querySelector('.local-settings');
  const installButton = elements.installButton;

  if (localSettings) content.appendChild(localSettings);
  if (installButton) content.appendChild(installButton);

  const privacyInfo = document.createElement('p');
  privacyInfo.className = 'ios-privacy-info';
  privacyInfo.textContent = 'Fotka se zpracuje lokálně a neopustí zařízení.';
  content.appendChild(privacyInfo);

  const installHelp = document.createElement('p');
  installHelp.className = 'ios-install-help';
  installHelp.innerHTML = '<strong>Instalace na iPhone:</strong> otevři Sdílet a zvol „Přidat na plochu“.';
  content.appendChild(installHelp);

  sheet.append(header, content);
  document.body.append(backdrop, sheet);

  let previousFocus = null;

  function syncVisibleViewport() {
    const height = Math.round(window.visualViewport?.height || window.innerHeight);
    document.documentElement.style.setProperty('--visible-viewport-height', `${height}px`);
  }

  function openSettings() {
    previousFocus = document.activeElement;
    document.body.classList.add('settings-open');
    settingsButton.setAttribute('aria-expanded', 'true');
    sheet.setAttribute('aria-hidden', 'false');
    if (elements.app) elements.app.inert = true;
    window.requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  }

  function closeSettings() {
    if (!document.body.classList.contains('settings-open')) return;
    document.body.classList.remove('settings-open');
    settingsButton.setAttribute('aria-expanded', 'false');
    sheet.setAttribute('aria-hidden', 'true');
    if (elements.app) elements.app.inert = false;
    const focusTarget = previousFocus instanceof HTMLElement ? previousFocus : settingsButton;
    window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  }

  function syncDock() {
    const retakeVisible = elements.retakeButton && !elements.retakeButton.classList.contains('hidden');
    elements.switchCameraButton?.classList.toggle('dock-suppressed', Boolean(retakeVisible));
    buttonGroup.classList.toggle('dock-has-retake', Boolean(retakeVisible));
  }

  settingsButton.addEventListener('click', openSettings);
  closeButton.addEventListener('click', closeSettings);
  backdrop.addEventListener('click', closeSettings);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('settings-open')) {
      event.preventDefault();
      closeSettings();
    }
  });

  const controlsObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(syncDock);
  [elements.retakeButton, elements.switchCameraButton].forEach((button) => {
    if (button) controlsObserver.observe(button, { attributes: true, attributeFilter: ['class'] });
  });

  syncVisibleViewport();
  syncDock();

  window.addEventListener('resize', syncVisibleViewport, { passive: true });
  window.addEventListener('orientationchange', syncVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisibleViewport, { passive: true });

  window.addEventListener('pagehide', () => {
    controlsObserver.disconnect();
    if (elements.app) elements.app.inert = false;
    window.removeEventListener('resize', syncVisibleViewport);
    window.removeEventListener('orientationchange', syncVisibleViewport);
    window.visualViewport?.removeEventListener('resize', syncVisibleViewport);
    window.visualViewport?.removeEventListener('scroll', syncVisibleViewport);
  }, { once: true });
})();

/* === face-aware-crop-runtime.js === */
/* Smažka v72 — runtime bridge between face geometry, warp renderer and result UI. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const cropApi = window.SmazkaFaceCrop;
  const faceWarp = window.SmazkaFaceWarp;
  if (!app?.state || !app?.elements?.result || !cropApi || typeof faceWarp?.renderFaceEffect !== 'function') return;

  const { state, elements } = app;
  const originalRenderFaceEffect = faceWarp.renderFaceEffect.bind(faceWarp);
  const MEDIA_SELECTOR = [
    '.result-visual > img:not(.junkie-share-source)',
    '.result-visual > canvas',
    '.result-visual > .junkie-polished-image',
    '.result-visual > .junkie-morph-origin',
    '.result-visual > .junkie-morph-final'
  ].join(', ');
  let focusFrame = 0;

  function alreadyPrepared(faceAnalysis, width, height) {
    const output = faceAnalysis?.crop?.output;
    return faceAnalysis?.crop?.version === 72
      && Number(output?.width) === Number(width)
      && Number(output?.height) === Number(height);
  }

  async function renderFaceEffect(options = {}) {
    const width = Math.max(120, Math.round(Number(options.output?.width) || 720));
    const height = Math.max(160, Math.round(Number(options.output?.height) || 960));
    const sourceAnalysis = options.faceAnalysis || state.faceAnalysis;
    let imageData = options.imageData;
    let faceAnalysis = sourceAnalysis;
    let crop = sourceAnalysis?.crop?.source ? sourceAnalysis.crop : null;

    if (imageData && sourceAnalysis && !alreadyPrepared(sourceAnalysis, width, height)) {
      if (!state.originalImageData || state.currentImageData === imageData) {
        state.originalImageData = imageData;
      }
      const prepared = await cropApi.cropImageData(imageData, width, height, sourceAnalysis, {
        type: 'image/jpeg',
        quality: 0.93
      });
      imageData = prepared.dataUrl;
      faceAnalysis = prepared.faceAnalysis;
      crop = prepared.crop;

      // The legacy observer performs a second animated render from currentImageData.
      // Make the face-aware source canonical so that pass cannot return to a center crop.
      state.currentImageData = imageData;
      state.faceAnalysis = faceAnalysis;
      state.effectFaceAnalysis = faceAnalysis;
      state.faceCrop = crop;
    }

    const rendered = await originalRenderFaceEffect({
      ...options,
      imageData,
      faceAnalysis
    });

    state.effectFaceAnalysis = faceAnalysis || state.faceAnalysis;
    if (crop) state.faceCrop = crop;
    return {
      ...rendered,
      faceAnalysis: state.effectFaceAnalysis,
      faceCrop: crop || state.faceCrop || null
    };
  }

  window.SmazkaFaceWarp = Object.freeze({
    ...faceWarp,
    renderFaceEffect
  });

  function mediaDimensions(media) {
    return {
      width: Number(media?.naturalWidth || media?.width || media?.videoWidth || 0),
      height: Number(media?.naturalHeight || media?.height || media?.videoHeight || 0)
    };
  }

  function applyResultFocus() {
    window.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    const result = elements.result;
    if (!result || result.classList.contains('hidden')) return;
    const visual = result.querySelector('.result-visual');
    if (!visual?.clientWidth || !visual?.clientHeight) return;
    const faceAnalysis = state.effectFaceAnalysis || state.faceAnalysis;
    if (!faceAnalysis) return;

    result.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
      const source = mediaDimensions(media);
      if (!source.width || !source.height) {
        if (media instanceof HTMLImageElement && !media.dataset.faceCropLoadBound) {
          media.dataset.faceCropLoadBound = 'true';
          media.addEventListener('load', scheduleResultFocus, { once: true });
        }
        return;
      }

      const crop = cropApi.calculateCrop({
        sourceWidth: source.width,
        sourceHeight: source.height,
        targetWidth: visual.clientWidth,
        targetHeight: visual.clientHeight,
        faceAnalysis
      });
      media.style.setProperty(
        'object-position',
        `${crop.objectPositionX.toFixed(2)}% ${crop.objectPositionY.toFixed(2)}%`,
        'important'
      );
      media.style.setProperty('transform', 'none', 'important');
      visual.style.setProperty('--face-crop-x', `${crop.objectPositionX.toFixed(2)}%`);
      visual.style.setProperty('--face-crop-y', `${crop.objectPositionY.toFixed(2)}%`);
      visual.dataset.faceAwareCrop = 'v72';
    });
  }

  function scheduleResultFocus() {
    window.cancelAnimationFrame(focusFrame);
    focusFrame = window.requestAnimationFrame(applyResultFocus);
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    scheduleResultFocus();
    window.setTimeout(scheduleResultFocus, 100);
    window.setTimeout(scheduleResultFocus, 460);
    window.setTimeout(scheduleResultFocus, 1350);
  });
  observer.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'width', 'height']
  });

  window.addEventListener('resize', scheduleResultFocus, { passive: true });
  window.addEventListener('orientationchange', scheduleResultFocus, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleResultFocus, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleResultFocus, { passive: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(focusFrame);
  }, { once: true });
})();

/* === analysis-state-stability-v84.js === */
/* Smažka v84 — make busy state writes idempotent across result observers. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const state = app?.state;
  const appRoot = app?.elements?.app;
  const nativeSetBusy = app?.setBusy;
  if (!state || !appRoot || typeof nativeSetBusy !== 'function' || app.__stableBusyV84) return;

  function stableSetBusy(value) {
    const next = Boolean(value);
    const attributeValue = String(next);
    if (
      state.isAnalyzing === next
      && appRoot.getAttribute('aria-busy') === attributeValue
    ) return undefined;
    return nativeSetBusy.call(app, next);
  }

  app.setBusy = stableSetBusy;
  Object.defineProperty(app, '__stableBusyV84', {
    configurable: false,
    enumerable: false,
    value: true
  });

  window.SmazkaAnalysisStateStability = Object.freeze({
    version: 84,
    isStable: () => app.setBusy === stableSetBusy
  });
})();

/* === analysis-completion-guard-v84.js === */
/* Smažka v84 — guarantee that analysis always reaches an interactive result. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const state = app?.state;
  const elements = app?.elements;
  const result = elements?.result;
  const stage = elements?.cameraStage;
  if (!state || !elements?.app || !result || !stage) return;

  const ANALYSIS_TIMEOUT_MS = 7200;
  const REVEAL_TIMEOUT_MS = 1450;
  const revealClasses = [
    'is-revealing-result',
    'reveal-phase-freeze',
    'reveal-phase-pulse',
    'reveal-phase-print',
    'reveal-soft',
    'reveal-wobble',
    'reveal-melt',
    'reveal-critical',
    'reveal-glitch',
    'reveal-cosmic',
    'reveal-hollow',
    'reveal-lens'
  ];

  let analysisTimer = 0;
  let revealTimer = 0;
  let recoveryRunning = false;
  let recoverySequence = 0;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function clearTimer(name) {
    if (name === 'analysis') {
      window.clearTimeout(analysisTimer);
      analysisTimer = 0;
      return;
    }
    window.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      || (!result.classList.contains('hidden') && (result.open || result.hasAttribute('open')));
  }

  function scanIsActive() {
    return document.body.classList.contains('face-scan-active');
  }

  function clearLegacyReveal() {
    if (revealClasses.some((className) => stage.classList.contains(className))) {
      stage.classList.remove(...revealClasses);
    }

    const overlay = stage.querySelector('.result-reveal-overlay');
    if (overlay && overlay.getAttribute('aria-hidden') !== 'true') {
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function selectedVerdict() {
    const selection = state.faceAnalysis?.selection;
    const library = Array.isArray(state.responseLibrary) ? state.responseLibrary : [];
    if (selection?.responseId) {
      const byId = library.find((item) => item?.id === selection.responseId);
      if (byId) return byId;
    }
    if (selection?.category) {
      const byCategory = library.find((item) => item?.category === selection.category);
      if (byCategory) return byCategory;
    }
    if (state.lastAnalysisResult?.title) {
      return {
        id: state.lastAnalysisResult.id || '',
        category: state.lastAnalysisResult.title,
        description: state.lastAnalysisResult.description || '',
        effect: state.lastAnalysisResult.effect || state.effectProfile?.key || 'facial-drift',
        signals: state.lastAnalysisResult.signals || []
      };
    }
    return null;
  }

  function severityValue(verdict) {
    const selectionSeverity = Number(state.faceAnalysis?.selection?.severity);
    const candidates = [
      Number(state.effectSeverity),
      Number(state.visualDamageSeverity),
      selectionSeverity,
      Number(state.lastAnalysisResult?.severity)
    ];
    const measured = candidates.find((value) => Number.isFinite(value) && value > 0);
    if (Number.isFinite(measured)) return clamp(Math.round(measured), 12, 98);
    const minimum = Number(verdict?.severity?.min);
    const maximum = Number(verdict?.severity?.max);
    if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
      return clamp(Math.round((minimum + maximum) / 2), 12, 98);
    }
    return 50;
  }

  function effectProfile(verdict) {
    if (state.effectProfile?.key) return state.effectProfile;
    const key = String(verdict?.effect || 'facial-drift');
    return {
      key,
      label: key.replace(/-/g, ' '),
      tone: 'wobble'
    };
  }

  function showDialog() {
    elements.resultBackdrop?.classList.remove('hidden');
    result.classList.remove('hidden');
    if (!result.open && typeof result.showModal === 'function') {
      try {
        result.showModal();
      } catch (error) {
        console.warn('Nouzový dialog výsledku používá open fallback:', error);
        result.setAttribute('open', '');
      }
    } else if (!result.open) {
      result.setAttribute('open', '');
    }
    document.body.classList.add('result-open');
    elements.app.inert = true;
    result.scrollTop = 0;
  }

  async function startNewScan() {
    app.hideResult?.();
    app.setBusy(false);
    app.clearCurrentImage?.();
    elements.retakeButton?.classList.add('hidden');
    elements.analyzeButton?.classList.remove('hidden');
    app.clearErrors?.();
    await app.initCamera?.();
    elements.analyzeButton?.focus?.({ preventScroll: true });
  }

  function buildEmergencyResult(verdict) {
    if (!verdict || resultIsOpen()) return false;

    const severity = severityValue(verdict);
    const profile = effectProfile(verdict);
    const titleText = app.syncWeekdayText?.(verdict.category || 'Neznámý stav') || verdict.category || 'Neznámý stav';
    const descriptionText = app.syncWeekdayText?.(
      verdict.description || 'Verdikt doběhl nouzovým průchodem. Výsledek je pořád jen satira, ne diagnóza.'
    ) || verdict.description || '';
    const imageSource = state.effectImageData || state.currentImageData || '';

    state.lastAnalysisResult = {
      id: verdict.id || '',
      title: titleText,
      description: descriptionText,
      severity,
      effect: profile.key,
      signals: Array.isArray(verdict.signals) ? [...verdict.signals] : [],
      effectProfile: profile
    };
    state.effectSeverity = severity;
    state.effectProfile = profile;
    state.effectImageData = imageSource;
    state.shareImagePromise = Promise.resolve(imageSource);

    result.replaceChildren();

    const closeButton = document.createElement('button');
    closeButton.className = 'result-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Zavřít výsledek');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => app.hideResult?.({ restoreFocus: true }));

    const content = document.createElement('div');
    content.className = 'result-content';

    const badge = document.createElement('div');
    badge.className = 'result-badge';
    badge.textContent = 'VOID VERDIKT // RECOVERY';

    const visual = document.createElement('figure');
    visual.className = `result-visual effect-${profile.key}`;
    visual.style.setProperty('--effect-strength', String(severity / 100));
    visual.dataset.analysisRecovery = 'v84';

    const image = document.createElement('img');
    image.src = imageSource;
    image.alt = `Výsledek skenu. Intenzita efektu ${severity} procent.`;

    const noise = document.createElement('span');
    noise.className = 'effect-noise';
    noise.setAttribute('aria-hidden', 'true');

    const label = document.createElement('figcaption');
    label.className = 'effect-label';
    label.innerHTML = `<span>${profile.label || 'VOID efekt'}</span><strong>${severity}%</strong>`;
    visual.append(image, noise, badge, label);

    const title = document.createElement('h2');
    title.id = 'resultTitle';
    title.textContent = titleText;

    const description = document.createElement('p');
    description.className = 'description';
    description.textContent = descriptionText;

    const shareButton = document.createElement('button');
    shareButton.id = 'shareResultButton';
    shareButton.className = 'share-button';
    shareButton.type = 'button';
    shareButton.innerHTML = '<span class="button-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-share"></use></svg></span><span>Sdílet rozsudek</span>';

    const newScanButton = document.createElement('button');
    newScanButton.className = 'new-scan-button';
    newScanButton.type = 'button';
    newScanButton.innerHTML = '<span class="button-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-retry"></use></svg></span><span>Nový sken</span>';
    newScanButton.addEventListener('click', () => void startNewScan());

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.append(shareButton, newScanButton);

    content.append(visual, title, description, actions);
    result.setAttribute('aria-labelledby', title.id);
    result.append(closeButton, content);

    clearLegacyReveal();
    elements.loading?.classList.add('hidden');
    app.setBusy(false);
    showDialog();
    app.setHint('Rozsudek je venku. iOS mezikrok byl přeskočen.');
    window.requestAnimationFrame(() => closeButton.focus?.({ preventScroll: true }));
    window.dispatchEvent(new CustomEvent('smazka:analysis-guard-recovered', {
      detail: { version: 84, severity, responseId: verdict.id || '' }
    }));
    return true;
  }

  async function recoverAnalysis(sequence) {
    if (recoveryRunning || sequence !== recoverySequence || resultIsOpen()) return;
    recoveryRunning = true;
    try {
      let verdict = selectedVerdict();
      if (!verdict) {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        verdict = selectedVerdict();
      }
      if (sequence !== recoverySequence || resultIsOpen()) return;
      if (verdict && buildEmergencyResult(verdict)) return;

      clearLegacyReveal();
      elements.loading?.classList.add('hidden');
      app.setBusy(false);
      app.showError('Analýza se na iOS zastavila dřív, než vybrala verdikt. Aplikace je odemčená, spusť sken znovu.');
      app.setHint('Dokončovací pojistka ukončila zaseknutý mezistav.');
    } catch (error) {
      console.error('Result completion guard selhal:', error);
      clearLegacyReveal();
      elements.loading?.classList.add('hidden');
      app.setBusy(false);
    } finally {
      recoveryRunning = false;
    }
  }

  function armAnalysisGuard() {
    clearTimer('analysis');
    const sequence = ++recoverySequence;
    analysisTimer = window.setTimeout(() => {
      analysisTimer = 0;
      void recoverAnalysis(sequence);
    }, ANALYSIS_TIMEOUT_MS);
  }

  function armRevealGuard() {
    clearTimer('reveal');
    const sequence = recoverySequence || ++recoverySequence;
    revealTimer = window.setTimeout(() => {
      revealTimer = 0;
      if (!resultIsOpen()) void recoverAnalysis(sequence);
    }, REVEAL_TIMEOUT_MS);
  }

  function syncLifecycle() {
    const busy = state.isAnalyzing || elements.app.getAttribute('aria-busy') === 'true';
    if (resultIsOpen()) {
      clearTimer('analysis');
      clearTimer('reveal');
      elements.loading?.classList.add('hidden');
      app.setBusy(false);
      clearLegacyReveal();
      return;
    }

    if (stage.classList.contains('is-revealing-result')) {
      clearLegacyReveal();
      armRevealGuard();
      return;
    }

    if (busy && !scanIsActive()) {
      if (!analysisTimer) armAnalysisGuard();
      return;
    }

    if (!busy) clearTimer('analysis');
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(syncLifecycle);
  observer.observe(elements.app, { attributes: true, attributeFilter: ['aria-busy'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(stage, { attributes: true, attributeFilter: ['class'] });
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('pagehide', () => {
    recoverySequence += 1;
    clearTimer('analysis');
    clearTimer('reveal');
    observer.disconnect();
  }, { once: true });

  window.SmazkaAnalysisCompletionGuard = Object.freeze({
    version: 84,
    analysisTimeoutMs: ANALYSIS_TIMEOUT_MS,
    revealTimeoutMs: REVEAL_TIMEOUT_MS,
    recoverNow() {
      const sequence = ++recoverySequence;
      return recoverAnalysis(sequence);
    }
  });

  syncLifecycle();
})();

/* === analysis-rescue-v85.js === */
/* Smažka v85 — delayed, user-controlled escape hatch for slow iOS result handoffs. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const guard = window.SmazkaAnalysisCompletionGuard;
  const state = app?.state;
  const elements = app?.elements;
  const appRoot = elements?.app;
  const scanHint = elements?.scanHint;
  const result = elements?.result;
  if (!state || !appRoot || !scanHint || !result || typeof guard?.recoverNow !== 'function') return;

  const SHOW_AFTER_MS = 4300;
  let revealTimer = 0;
  let generation = 0;
  let recoveryRunning = false;

  const panel = document.createElement('div');
  panel.className = 'analysis-rescue-v85';
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Nouzové dokončení pomalé analýzy');
  panel.innerHTML = `
    <span class="analysis-rescue-copy">
      <strong>Systém se zdržel v předsálí.</strong>
      <small>Použiju už naměřená data.</small>
    </span>
    <button class="analysis-rescue-button" type="button">Vynutit rozsudek</button>
  `;
  scanHint.insertAdjacentElement('afterend', panel);

  const copy = panel.querySelector('.analysis-rescue-copy');
  const button = panel.querySelector('.analysis-rescue-button');

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      || (!result.classList.contains('hidden') && (result.open || result.hasAttribute('open')));
  }

  function analysisIsDelayed() {
    const busy = state.isAnalyzing || appRoot.getAttribute('aria-busy') === 'true';
    const scannerActive = document.body.classList.contains('face-scan-active');
    return busy && !scannerActive && !resultIsOpen();
  }

  function clearRevealTimer() {
    window.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function hidePanel() {
    generation += 1;
    clearRevealTimer();
    panel.hidden = true;
    panel.classList.remove('is-recovering');
    panel.setAttribute('aria-hidden', 'true');
    button.disabled = false;
    button.textContent = 'Vynutit rozsudek';
    copy.innerHTML = '<strong>Systém se zdržel v předsálí.</strong><small>Použiju už naměřená data.</small>';
  }

  function showPanel(sequence) {
    if (sequence !== generation || !analysisIsDelayed() || recoveryRunning) return;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    appRoot.dataset.analysisRescue = 'v85';
  }

  function armPanel() {
    if (revealTimer || !analysisIsDelayed() || recoveryRunning) return;
    const sequence = ++generation;
    revealTimer = window.setTimeout(() => {
      revealTimer = 0;
      showPanel(sequence);
    }, SHOW_AFTER_MS);
  }

  function sync() {
    if (analysisIsDelayed()) {
      if (panel.hidden) armPanel();
      return;
    }
    hidePanel();
    delete appRoot.dataset.analysisRescue;
  }

  async function recover() {
    if (recoveryRunning || !analysisIsDelayed()) return;
    recoveryRunning = true;
    clearRevealTimer();
    panel.classList.add('is-recovering');
    button.disabled = true;
    button.textContent = 'Otevírám rozsudek…';
    copy.innerHTML = '<strong>Obcházím zaseknutý mezikrok.</strong><small>Verdikt ani biometriku neměním.</small>';

    try {
      await Promise.resolve(guard.recoverNow());
    } catch (error) {
      console.error('Ruční dokončení analýzy selhalo:', error);
      app.setBusy(false);
      elements.loading?.classList.add('hidden');
      app.showError?.('Nouzové dokončení selhalo. Aplikace je odemčená, zkus sken znovu.');
    } finally {
      recoveryRunning = false;
      sync();
    }
  }

  button.addEventListener('click', () => void recover());

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(sync);
  observer.observe(appRoot, { attributes: true, attributeFilter: ['aria-busy'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(result, {
    attributes: true,
    childList: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('smazka:analysis-guard-recovered', hidePanel);
  window.addEventListener('pagehide', () => {
    generation += 1;
    clearRevealTimer();
    observer.disconnect();
    panel.remove();
  }, { once: true });

  window.SmazkaAnalysisRescue = Object.freeze({
    version: 85,
    showAfterMs: SHOW_AFTER_MS,
    isVisible: () => !panel.hidden,
    recoverNow: recover
  });

  sync();
})();

/* === single-pass-result-v76.js === */
/* Smažka v76 — keep one face-warp render and reuse it for result + sharing. */
(() => {
  'use strict';

  function createResultToken({ title = '', severity = 50, imageData = '' } = {}) {
    return `${String(title)}|${Number(severity)}|${String(imageData).slice(-32)}`;
  }

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) {
    globalThis.SmazkaSinglePassResult = Object.freeze({ createResultToken });
    return;
  }

  const { state, elements } = app;
  const result = elements.result;
  let syncFrame = 0;

  function currentToken() {
    return createResultToken({
      title: state.lastAnalysisResult?.title || '',
      severity: Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50),
      imageData: state.currentImageData || ''
    });
  }

  function preparedImage(visual) {
    const media = visual?.querySelector(
      ':scope > img:not(.junkie-share-source), '
      + ':scope > .junkie-polished-image, '
      + ':scope > .junkie-morph-final'
    );
    return media?.currentSrc || media?.src || state.effectImageData || '';
  }

  function lockCurrentResult() {
    if (result.classList.contains('hidden') || !state.currentImageData) return false;
    const visual = result.querySelector('.result-visual');
    if (!visual) return false;

    const imageData = preparedImage(visual);
    const token = currentToken();
    if (!imageData || !token) return false;

    // face-warp.js uses the same token before starting its legacy second render.
    // Setting it synchronously inside the MutationObserver makes that pass a no-op.
    result.dataset.warpToken = token;
    result.dataset.renderStrategy = 'single-pass-v76';
    visual.dataset.renderSource = 'prepared-face-warp';

    state.effectImageData = imageData;
    state.shareImagePromise = Promise.resolve(imageData);
    return true;
  }

  function scheduleLock() {
    window.cancelAnimationFrame(syncFrame);
    syncFrame = window.requestAnimationFrame(lockCurrentResult);
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    // Run immediately: the legacy observer only schedules its work for the next frame.
    lockCurrentResult();
    scheduleLock();
  });
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src']
  });

  window.addEventListener('resize', scheduleLock, { passive: true });
  window.addEventListener('orientationchange', scheduleLock, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLock, { passive: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(syncFrame);
  }, { once: true });

  globalThis.SmazkaSinglePassResult = Object.freeze({
    createResultToken,
    lockCurrentResult
  });

  lockCurrentResult();
})();

/* === critical-impact-reveal-v82.js === */
/* Smažka v82 — cinematic bridge from Junkie Vision to the single-pass verdict. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const cropApi = window.SmazkaFaceCrop;
  const feed = window.SmazkaLandmarkFeed;
  const state = app?.state;
  const result = app?.elements?.result || document.getElementById('result');
  if (!state || !result) return;

  const REVEAL_MS = 1540;
  const EXIT_MS = 260;
  const CROP_WIDTH = 480;
  const CROP_HEIGHT = 640;
  const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
  const MOUTH = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let lastToken = '';
  let scheduledFrame = 0;
  let activeRun = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function resultIsVisible() {
    return !result.classList.contains('hidden') && (result.open || result.hasAttribute('open'));
  }

  function severityValue() {
    const fromState = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 0);
    if (Number.isFinite(fromState) && fromState > 0) return clamp(Math.round(fromState), 0, 100);
    const label = result.querySelector('.effect-label strong')?.textContent || '0';
    return clamp(Number.parseInt(label, 10) || 0, 0, 100);
  }

  function resultToken() {
    return [
      state.lastAnalysisResult?.title || result.querySelector('h2')?.textContent || '',
      severityValue(),
      String(state.currentImageData || '').slice(-36),
      String(state.effectImageData || '').slice(-36)
    ].join('|');
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impact reveal image decode failed'));
      image.src = source;
    });
  }

  async function prepareOriginal() {
    const source = state.currentImageData || '';
    const analysis = state.faceAnalysis || feed?.getSnapshot?.() || null;
    if (!source || typeof cropApi?.cropImageData !== 'function') {
      return { dataUrl: source, faceAnalysis: analysis };
    }

    try {
      const cropped = await Promise.race([
        cropApi.cropImageData(source, CROP_WIDTH, CROP_HEIGHT, analysis, {
          type: 'image/jpeg',
          quality: 0.91
        }),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('crop timeout')), 320))
      ]);
      return {
        dataUrl: cropped?.dataUrl || source,
        faceAnalysis: cropped?.faceAnalysis || analysis
      };
    } catch {
      return { dataUrl: source, faceAnalysis: analysis };
    }
  }

  function effectSource() {
    const visualImage = result.querySelector(
      '.result-visual > img:not(.junkie-share-source), '
      + '.result-visual > .junkie-polished-image, '
      + '.result-visual > .junkie-morph-final'
    );
    return visualImage?.currentSrc || visualImage?.src || state.effectImageData || state.currentImageData || '';
  }

  function drawPolyline(context, points, indices, color, width, alpha = 1, close = false) {
    const line = indices.map((index) => points?.[index]).filter(Boolean);
    if (line.length < 2) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.beginPath();
    context.moveTo(line[0].x, line[0].y);
    line.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (close) context.closePath();
    context.stroke();
    context.restore();
  }

  function drawFrozenMesh(canvas, normalizedLandmarks) {
    if (!Array.isArray(normalizedLandmarks) || normalizedLandmarks.length < 468) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sourceRatio = CROP_WIDTH / CROP_HEIGHT;
    const targetRatio = width / height;
    let renderedWidth = width;
    let renderedHeight = height;
    let offsetX = 0;
    let offsetY = 0;
    if (sourceRatio > targetRatio) {
      renderedHeight = height;
      renderedWidth = height * sourceRatio;
      offsetX = (width - renderedWidth) / 2;
    } else {
      renderedWidth = width;
      renderedHeight = width / sourceRatio;
      offsetY = (height - renderedHeight) / 2;
    }

    const points = normalizedLandmarks.map((point) => ({
      x: offsetX + clamp(Number(point?.x || 0), 0, 1) * renderedWidth,
      y: offsetY + clamp(Number(point?.y || 0), 0, 1) * renderedHeight
    }));

    const connections = Array.isArray(window.FACEMESH_TESSELATION)
      ? window.FACEMESH_TESSELATION
      : [];
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = '#00ff66';
    context.globalAlpha = 0.42;
    context.lineWidth = 0.58;
    context.beginPath();
    let drawn = 0;
    for (let index = 0; index < connections.length && drawn < 360; index += 4) {
      const [fromIndex, toIndex] = connections[index] || [];
      const from = points[fromIndex];
      const to = points[toIndex];
      if (!from || !to) continue;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      drawn += 1;
    }
    context.stroke();
    context.restore();

    drawPolyline(context, points, FACE_OVAL, '#00ff66', 1.1, 0.76, true);
    drawPolyline(context, points, RIGHT_EYE, '#ff0055', 1.25, 0.82, true);
    drawPolyline(context, points, LEFT_EYE, '#ff0055', 1.25, 0.82, true);
    drawPolyline(context, points, MOUTH, '#ffcc00', 1.15, 0.8, true);
  }

  function createSlice(effect, top, direction, delay) {
    const slice = document.createElement('div');
    const shift = direction * (20 + top / 3);
    slice.className = 'impact-glitch-slice';
    slice.style.setProperty('--impact-slice-top', `${top}%`);
    slice.style.setProperty('--impact-slice-shift', `${shift}px`);
    slice.style.setProperty('--impact-slice-reverse', `${shift * -0.5}px`);
    slice.style.setProperty('--impact-slice-return', `${shift * 0.35}px`);
    slice.style.setProperty('--impact-slice-delay', `${delay}ms`);
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.src = effect;
    image.style.transform = `translateY(-${top}vh)`;
    slice.appendChild(image);
    return slice;
  }

  function createOverlay(original, effect, severity) {
    const overlay = document.createElement('div');
    overlay.className = 'critical-impact-reveal';
    overlay.dataset.severity = severity >= 80 ? 'critical' : severity >= 50 ? 'disturbed' : 'calm';
    overlay.setAttribute('aria-hidden', 'true');

    const originalImage = document.createElement('img');
    originalImage.className = 'impact-image impact-original';
    originalImage.alt = '';
    originalImage.decoding = 'async';
    originalImage.src = original;

    const effectImage = document.createElement('img');
    effectImage.className = 'impact-image impact-effect';
    effectImage.alt = '';
    effectImage.decoding = 'async';
    effectImage.src = effect;

    const mesh = document.createElement('canvas');
    mesh.className = 'impact-mesh';

    const wipe = document.createElement('div');
    wipe.className = 'impact-wipe-line';

    const stamp = document.createElement('div');
    stamp.className = 'impact-stamp';
    stamp.innerHTML = '<span>BIOLOGICKÁ REKLAMACE</span><strong>PŘIJATA</strong><small>VOID LAB // LOKÁLNÍ DŮKAZ</small>';

    const status = document.createElement('div');
    status.className = 'impact-status';
    status.innerHTML = `<span>CRITICAL IMPACT DETECTED</span><strong>${String(severity).padStart(2, '0')}%</strong>`;

    const noise = document.createElement('div');
    noise.className = 'impact-noise';

    overlay.append(
      originalImage,
      effectImage,
      mesh,
      wipe,
      createSlice(effect, 29, -1, 210),
      createSlice(effect, 51, 1, 275),
      createSlice(effect, 69, -1, 340),
      noise,
      status,
      stamp
    );
    return { overlay, mesh };
  }

  function installSeal(severity) {
    const visual = result.querySelector('.result-visual');
    if (!visual) return null;
    const level = severity >= 80 ? 'critical' : severity >= 50 ? 'disturbed' : 'calm';
    const existing = visual.querySelector('.impact-verdict-seal');
    if (
      existing
      && existing.dataset.level === level
      && existing.dataset.severity === String(severity)
    ) return existing;

    existing?.remove();
    const seal = document.createElement('div');
    seal.className = 'impact-verdict-seal';
    seal.dataset.level = level;
    seal.dataset.severity = String(severity);
    seal.innerHTML = `<span>VOID IMPACT</span><strong>${severity}%</strong><small>REKLAMACE PŘIJATA</small>`;
    visual.appendChild(seal);
    window.requestAnimationFrame(() => seal.classList.add('is-mounted'));
    return seal;
  }

  function vibrate(severity) {
    try {
      navigator.vibrate?.(severity >= 80 ? [18, 28, 45, 34, 68] : [14, 30, 34]);
    } catch {
      // Optional haptics.
    }
  }

  async function runReveal(token) {
    const runId = ++activeRun;
    lastToken = token;
    result.querySelector('.critical-impact-reveal')?.remove();

    const effect = effectSource();
    if (!effect) {
      installSeal(severityValue());
      return;
    }

    const prepared = await prepareOriginal();
    if (runId !== activeRun || !resultIsVisible()) return;
    const original = prepared.dataUrl || state.currentImageData || effect;
    const severity = severityValue();

    await Promise.allSettled([loadImage(original), loadImage(effect)]);
    if (runId !== activeRun || !resultIsVisible()) return;

    const { overlay, mesh } = createOverlay(original, effect, severity);
    result.appendChild(overlay);
    document.body.classList.add('critical-impact-active');
    drawFrozenMesh(mesh, prepared.faceAnalysis?.normalizedLandmarks || state.faceAnalysis?.normalizedLandmarks);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => overlay.classList.add('is-running'));
    });
    if (!reducedMotion.matches) vibrate(severity);

    const revealDuration = reducedMotion.matches ? 120 : REVEAL_MS;
    const exitDuration = reducedMotion.matches ? 40 : EXIT_MS;
    window.setTimeout(() => {
      if (runId !== activeRun) return;
      overlay.classList.add('is-finishing');
      installSeal(severity);
    }, revealDuration);

    window.setTimeout(() => {
      if (runId !== activeRun) return;
      overlay.remove();
      document.body.classList.remove('critical-impact-active');
      window.dispatchEvent(new CustomEvent('smazka:impact-reveal-complete', {
        detail: { severity, token }
      }));
    }, revealDuration + exitDuration);
  }

  function schedule() {
    window.cancelAnimationFrame(scheduledFrame);
    scheduledFrame = window.requestAnimationFrame(() => {
      if (!resultIsVisible() || !state.currentImageData) return;
      const token = resultToken();
      if (!token || token === lastToken) {
        if (token && !result.querySelector('.critical-impact-reveal')) {
          installSeal(severityValue());
        }
        return;
      }
      runReveal(token);
    });
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(schedule);
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open', 'src']
  });

  window.addEventListener('pagehide', () => {
    activeRun += 1;
    observer.disconnect();
    window.cancelAnimationFrame(scheduledFrame);
    result.querySelector('.critical-impact-reveal')?.remove();
    document.body.classList.remove('critical-impact-active');
  }, { once: true });

  schedule();
})();

/* === scanner-focus.js === */
/* Smažka v45 — safe scanner cleanup and cinematic result sequencing. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const result = app?.elements?.result || document.getElementById('result');
  const scanHint = app?.elements?.scanHint || document.getElementById('scanHint');
  const scanStatus = document.getElementById('scanStatus');
  const cameraStage = app?.elements?.cameraStage || document.getElementById('cameraStage');
  const preview = app?.elements?.preview || document.getElementById('preview');

  const neutralStatus = new Map([
    ['Probouzím VOID engine', 'Připravuji detekci'],
    ['Zamykám subjekt', 'Zamykám obličej'],
    ['Oči nalezeny • soudnost ne', 'Detekuji oči'],
    ['Nos a ústa pod dohledem', 'Detekuji rysy'],
    ['Kontura trosek hotová', 'Mapuji konturu'],
    ['Vážím zbytky důstojnosti', 'Analyzuji obličej'],
    ['Rozpad potvrzen', 'Analýza hotová'],
    ['Hledám oči, nos a zbytky tváře', 'Hledám obličej'],
    ['Přesná detekce odmítla svědčit', 'Detekce obličeje není dostupná']
  ]);

  const revealPhases = ['reveal-phase-freeze', 'reveal-phase-pulse', 'reveal-phase-print'];
  let revealTimers = [];
  let wasRevealing = cameraStage?.classList.contains('is-revealing-result') || false;
  let lastStablePreviewSrc = preview?.getAttribute('src') || '';
  let revealTargetSrc = '';
  let suppressPreviewObservation = false;

  function cleanStatusCopy() {
    const copy = document.querySelector('.scan-state-copy');
    if (!copy) return;
    const value = copy.textContent.trim();
    if (/^\d+ bodů subjektu zamčeno$/.test(value)) {
      copy.textContent = 'Obličej nalezen';
      return;
    }
    if (neutralStatus.has(value)) copy.textContent = neutralStatus.get(value);
  }

  function cleanHintCopy() {
    if (!scanHint) return;
    const value = scanHint.textContent.trim();
    const replacements = [
      [/^Portál běží\./, 'Kamera je připravená.'],
      [/^Subjekt zamčen\./, 'Obličej nalezen.'],
      [/^Podívej se do portálu/, 'Podívej se do kamery'],
      [/^VOID engine pitvá obraz a hledá zbytky člověka…$/, 'Analyzuju obličej… Počítám zbytky lidskosti.'],
      [/^Podsvětí tiskne rozsudek přímo do ksichtu…$/, 'Připravuju deformovaný rozsudek…'],
      [/^Rozsudek je venku\./, 'Rozsudek je hotový.']
    ];

    for (const [pattern, replacement] of replacements) {
      if (pattern.test(value)) {
        scanHint.textContent = value.replace(pattern, replacement);
        break;
      }
    }
  }

  function diagnosticValue(row) {
    const meter = row.querySelector('.diagnostic-meter i');
    const width = Number.parseFloat(meter?.style.width || meter?.getAttribute('data-value') || '');
    if (Number.isFinite(width)) return width;
    const value = row.querySelector('.diagnostic-copy strong')?.textContent || '';
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function keepOnlyWorstDiagnosticRed(root) {
    const rows = Array.from(root.querySelectorAll('.diagnostic-row'));
    if (!rows.length) return;
    const worst = rows.reduce((current, row) => (
      diagnosticValue(row) > diagnosticValue(current) ? row : current
    ), rows[0]);

    rows.forEach((row) => {
      row.classList.toggle('is-worst', row === worst);
      row.classList.toggle('is-danger', row === worst);
    });
  }

  function decorateResult() {
    if (!result || result.classList.contains('hidden')) return;

    const shareLabel = result.querySelector('#shareResultButton span:last-child');
    if (shareLabel) shareLabel.textContent = 'Sdílet rozsudek';

    const effectLabel = result.querySelector('.effect-label');
    if (effectLabel) {
      effectLabel.classList.add('result-score');
      const effectName = effectLabel.querySelector('span');
      let meta = result.querySelector('.result-effect-meta');
      if (!meta && effectName) {
        meta = document.createElement('p');
        meta.className = 'result-effect-meta';
        meta.innerHTML = `<span>Efekt</span><strong>${effectName.textContent.trim()}</strong>`;
        effectLabel.insertAdjacentElement('afterend', meta);
      }
      effectName?.remove();
    }

    keepOnlyWorstDiagnosticRed(result);
  }

  function clearRevealTimers() {
    revealTimers.forEach((timer) => window.clearTimeout(timer));
    revealTimers = [];
  }

  function clearRevealPhases() {
    clearRevealTimers();
    cameraStage?.classList.remove(...revealPhases);
    revealTargetSrc = '';
  }

  function setPreviewSource(src) {
    if (!preview || !src) return;
    suppressPreviewObservation = true;
    preview.setAttribute('src', src);
    window.requestAnimationFrame(() => {
      suppressPreviewObservation = false;
    });
  }

  function startCinematicReveal() {
    if (!cameraStage || !preview || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    clearRevealTimers();
    cameraStage.classList.remove(...revealPhases);

    revealTargetSrc = preview.getAttribute('src') || '';
    const frozenSource = lastStablePreviewSrc && lastStablePreviewSrc !== revealTargetSrc
      ? lastStablePreviewSrc
      : '';

    cameraStage.classList.add('reveal-phase-freeze');
    if (frozenSource) setPreviewSource(frozenSource);

    revealTimers.push(window.setTimeout(() => {
      if (revealTargetSrc) setPreviewSource(revealTargetSrc);
      cameraStage.classList.remove('reveal-phase-freeze');
      cameraStage.classList.add('reveal-phase-pulse');
    }, 150));

    revealTimers.push(window.setTimeout(() => {
      cameraStage.classList.remove('reveal-phase-pulse');
      cameraStage.classList.add('reveal-phase-print');
    }, 320));

    revealTimers.push(window.setTimeout(() => {
      cameraStage.classList.remove('reveal-phase-print');
      if (revealTargetSrc) lastStablePreviewSrc = revealTargetSrc;
    }, 970));
  }

  const resultObserver = result && new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    window.requestAnimationFrame(decorateResult);
  });
  resultObserver?.observe(result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const copyObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    cleanStatusCopy();
    cleanHintCopy();
  });
  if (scanStatus) copyObserver.observe(scanStatus, { childList: true, subtree: true, characterData: true });
  if (scanHint) copyObserver.observe(scanHint, { childList: true, subtree: true, characterData: true });

  const previewObserver = preview && new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    if (suppressPreviewObservation) return;
    const currentSrc = preview.getAttribute('src') || '';
    if (!cameraStage?.classList.contains('is-revealing-result')) {
      lastStablePreviewSrc = currentSrc;
    } else if (!revealTargetSrc && currentSrc !== lastStablePreviewSrc) {
      revealTargetSrc = currentSrc;
    }
  });
  previewObserver?.observe(preview, { attributes: true, attributeFilter: ['src'] });

  const revealObserver = cameraStage && new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    const isRevealing = cameraStage.classList.contains('is-revealing-result');
    if (isRevealing && !wasRevealing) startCinematicReveal();
    if (!isRevealing && wasRevealing) clearRevealPhases();
    wasRevealing = isRevealing;
  });
  revealObserver?.observe(cameraStage, { attributes: true, attributeFilter: ['class'] });

  cleanStatusCopy();
  cleanHintCopy();
  decorateResult();

  window.addEventListener('pagehide', () => {
    clearRevealPhases();
    resultObserver?.disconnect();
    copyObserver.disconnect();
    previewObserver?.disconnect();
    revealObserver?.disconnect();
  }, { once: true });
})();

/* === face-guidance.js === */
/* Smažka v48 — local face positioning guidance plus stable mobile hero focus. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const stage = app?.elements?.cameraStage || document.getElementById('cameraStage');
  const hint = app?.elements?.scanHint || document.getElementById('scanHint');
  const loading = app?.elements?.loading || document.getElementById('loading');
  if (!stage || !hint) return;

  const SAMPLE_INTERVAL = 150;
  const STABLE_SAMPLES = 3;
  const HERO_RELEASE_DELAY = 650;
  const EYE_GROUPS = {
    right: [33, 133, 159, 145],
    left: [263, 362, 386, 374]
  };

  let animationFrame = 0;
  let lastSampleAt = 0;
  let pendingKey = '';
  let pendingCount = 0;
  let appliedKey = '';
  let heroReleaseTimer = 0;

  function setHeroEngaged(engaged, { immediate = false } = {}) {
    if (engaged) {
      window.clearTimeout(heroReleaseTimer);
      heroReleaseTimer = 0;
      document.body.classList.add('face-guidance-engaged');
      return;
    }

    const release = () => {
      heroReleaseTimer = 0;
      document.body.classList.remove('face-guidance-engaged');
    };

    if (immediate) {
      window.clearTimeout(heroReleaseTimer);
      release();
      return;
    }

    if (!heroReleaseTimer) {
      heroReleaseTimer = window.setTimeout(release, HERO_RELEASE_DELAY);
    }
  }

  function visiblePoint(index) {
    const node = stage.querySelector(`.face-landmark-mesh .landmark[data-index="${index}"]`);
    if (!node || node.hidden) return null;
    const x = Number.parseFloat(node.getAttribute('cx'));
    const y = Number.parseFloat(node.getAttribute('cy'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function averagePoint(indices) {
    const points = indices.map(visiblePoint).filter(Boolean);
    if (!points.length) return null;
    const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  function visibleLandmarks() {
    return Array.from(stage.querySelectorAll('.face-landmark-mesh .landmark'))
      .filter((node) => !node.hidden)
      .map((node) => ({
        x: Number.parseFloat(node.getAttribute('cx')),
        y: Number.parseFloat(node.getAttribute('cy'))
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function geometry() {
    const points = visibleLandmarks();
    if (points.length < 8 || !stage.clientWidth || !stage.clientHeight) return null;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rightEye = averagePoint(EYE_GROUPS.right);
    const leftEye = averagePoint(EYE_GROUPS.left);
    const eyeAngle = rightEye && leftEye
      ? Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x)
      : 0;

    return {
      widthRatio: (maxX - minX) / stage.clientWidth,
      heightRatio: (maxY - minY) / stage.clientHeight,
      centerX: ((minX + maxX) / 2) / stage.clientWidth,
      centerY: ((minY + maxY) / 2) / stage.clientHeight,
      eyeAngle
    };
  }

  function guidanceForFace(face) {
    if (face.widthRatio < 0.3 || face.heightRatio < 0.32) {
      return { key: 'closer', state: 'adjust', message: 'Přibliž obličej ke kameře.' };
    }
    if (face.widthRatio > 0.76 || face.heightRatio > 0.78) {
      return { key: 'farther', state: 'adjust', message: 'Ustup trochu od kamery.' };
    }
    if (face.centerX < 0.41) {
      return { key: 'right', state: 'adjust', message: 'Posuň obličej doprava.' };
    }
    if (face.centerX > 0.59) {
      return { key: 'left', state: 'adjust', message: 'Posuň obličej doleva.' };
    }
    if (face.centerY < 0.37) {
      return { key: 'down', state: 'adjust', message: 'Posuň obličej níž.' };
    }
    if (face.centerY > 0.63) {
      return { key: 'up', state: 'adjust', message: 'Posuň obličej výš.' };
    }
    if (Math.abs(face.eyeAngle) > 0.13) {
      return { key: 'level', state: 'adjust', message: 'Narovnej hlavu.' };
    }
    return { key: 'ready', state: 'ready', message: 'Obličej je správně. Spusť sken.' };
  }

  function scannerBusy(overlay) {
    return Boolean(
      document.body.classList.contains('face-scan-active')
      || overlay?.classList.contains('is-scanning')
      || overlay?.dataset.stage === 'complete'
      || (loading && !loading.classList.contains('hidden'))
    );
  }

  function clearGuidance({ keepHero = false, immediate = false } = {}) {
    pendingKey = '';
    pendingCount = 0;
    appliedKey = '';
    stage.removeAttribute('data-guidance');
    hint.removeAttribute('data-guidance');
    if (!keepHero) setHeroEngaged(false, { immediate });
  }

  function applyGuidance(next) {
    if (next.key !== pendingKey) {
      pendingKey = next.key;
      pendingCount = 1;
      return;
    }

    pendingCount += 1;
    if (pendingCount < STABLE_SAMPLES || appliedKey === next.key) return;

    appliedKey = next.key;
    stage.dataset.guidance = next.state;
    hint.dataset.guidance = next.state;
    hint.textContent = next.message;
    setHeroEngaged(true);
  }

  function showSearchState() {
    pendingKey = 'search';
    pendingCount = STABLE_SAMPLES;
    setHeroEngaged(false);
    if (appliedKey === 'search') return;
    appliedKey = 'search';
    stage.dataset.guidance = 'search';
    hint.dataset.guidance = 'search';
    hint.textContent = 'Obličej doprostřed.';
  }

  function sample(now) {
    animationFrame = window.requestAnimationFrame(sample);
    if (document.hidden || now - lastSampleAt < SAMPLE_INTERVAL) return;
    lastSampleAt = now;

    const overlay = document.getElementById('scanOverlay');
    const busy = scannerBusy(overlay);
    const unavailable = !stage.classList.contains('is-live')
      || stage.classList.contains('has-preview')
      || stage.classList.contains('has-camera-error')
      || busy;

    if (unavailable) {
      const preserveHero = busy || (
        stage.classList.contains('has-preview')
        && document.body.classList.contains('face-guidance-engaged')
      );
      clearGuidance({ keepHero: preserveHero });
      if (preserveHero) setHeroEngaged(true);
      return;
    }

    const face = geometry();
    if (!face || !overlay?.classList.contains('face-detected')) {
      showSearchState();
      return;
    }

    applyGuidance(guidanceForFace(face));
  }

  animationFrame = window.requestAnimationFrame(sample);

  window.addEventListener('pagehide', () => {
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(heroReleaseTimer);
    clearGuidance({ immediate: true });
  }, { once: true });
})();

/* === share-cover-v77.js === */
/* Smažka v115 — lazy 1080×1350 SMAŽKA protocol driven by the current warped result. */
(() => {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1350;
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

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function protocolStamp(severity) {
    if (severity >= 78) return 'PŘÍSTROJ DAL VÝPOVĚĎ';
    if (severity >= 45) return 'VZOREK HOŘÍ';
    return 'STOPOVÉ MNOŽSTVÍ CHAOSU';
  }

  function protocolTime(date = new Date()) {
    return new Intl.DateTimeFormat('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date).replace(',', ' ·');
  }

  function collectBiometricFindings(faceAnalysis) {
    const metrics = faceAnalysis?.metrics || state.lastDevastationMetrics || {};
    const apertura = clamp(finite(metrics.apertura, 50), 0, 100);
    const gravitace = clamp(finite(metrics.gravitace, 0), 0, 45);
    const lidskost = clamp(finite(metrics.lidskost, 50), 0, 100);
    const hydratace = clamp(finite(metrics.hydratace, 50), 0, 100);
    const asymetrie = String(metrics.asymetrie || 'střední').toLocaleLowerCase('cs-CZ');
    const asymmetryScores = { 'nízká': 22, 'střední': 58, 'vysoká': 96 };

    return [
      {
        label: 'OČNÍ APERTURA',
        value: `${Math.round(apertura)} %`,
        score: clamp(Math.abs(apertura - 50) * 2, 0, 100)
      },
      {
        label: 'GRAVITAČNÍ POSUN',
        value: `${Math.round(gravitace)} / 45`,
        score: gravitace / 45 * 100
      },
      {
        label: 'TVÁŘOVÁ ASYMETRIE',
        value: asymetrie.toLocaleUpperCase('cs-CZ'),
        score: asymmetryScores[asymetrie] || 58
      },
      {
        label: 'ZBYTKOVÁ LIDSKOST',
        value: `${Math.round(lidskost)} %`,
        score: 100 - lidskost
      },
      {
        label: 'HYDRATAČNÍ POPLACH',
        value: `${Math.round(100 - hydratace)} %`,
        score: 100 - hydratace
      }
    ]
      .sort((first, second) => second.score - first.score)
      .slice(0, 3);
  }

  function protocolCaseId(verdict) {
    const seed = hashText([
      verdict.title,
      verdict.severity,
      state.effectSeed || 0,
      String(verdict.imageSrc).slice(-48)
    ].join('|'));
    return seed.toString(36).toLocaleUpperCase('cs-CZ').padStart(7, '0').slice(-7);
  }

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
    const severityText = result.querySelector('.effect-label strong')?.textContent || '0%';
    const stateSeverity = Number(state.effectSeverity || state.lastAnalysisResult?.severity);
    const severity = clamp(
      Number.isFinite(stateSeverity) && stateSeverity > 0
        ? stateSeverity
        : Number.parseInt(severityText, 10) || 0,
      0,
      100
    );
    const visibleImage = visual?.querySelector('img:not(.junkie-share-source)');
    const imageSrc = visibleImage?.currentSrc
      || visibleImage?.src
      || state.effectImageData
      || state.currentImageData
      || '';

    const faceAnalysis = state.effectFaceAnalysis || state.faceAnalysis || null;
    const verdict = {
      title: result.querySelector('h2')?.textContent?.trim() || 'Rozsudek odmítl vypovídat',
      description: result.querySelector('.description')?.textContent?.trim()
        || 'Lokální pseudo AI zachytila stav, který se věda rozhodla dál nekomentovat.',
      severity,
      imageSrc,
      faceAnalysis,
      findings: collectBiometricFindings(faceAnalysis),
      stamp: protocolStamp(severity),
      printedAt: protocolTime(),
      accent: severity >= 80 ? '#f7768e' : '#70e1cf'
    };
    verdict.caseId = protocolCaseId(verdict);
    return verdict;
  }

  function verdictToken(verdict) {
    return [
      verdict.title,
      verdict.description,
      verdict.severity,
      verdict.caseId,
      verdict.findings.map((finding) => `${finding.label}:${finding.value}`).join(','),
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

  function drawFakeBarcode(ctx, x, y, width, height, caseId) {
    const seed = hashText(caseId);
    ctx.fillStyle = 'rgba(244, 247, 246, 0.08)';
    ctx.fillRect(x, y, width, height);
    let cursor = x + 8;
    let index = 0;
    while (cursor < x + width - 8) {
      const shifted = seed >>> (index % 24);
      const barWidth = 2 + (shifted & 3) * 2;
      const gap = 2 + ((shifted >>> 2) & 3);
      ctx.fillStyle = index % 5 === 0 ? '#70e1cf' : 'rgba(244, 247, 246, 0.78)';
      ctx.fillRect(cursor, y + 7, Math.min(barWidth, x + width - 8 - cursor), height - 14);
      cursor += barWidth + gap;
      index += 1;
    }
  }

  async function renderProtocolBlob(verdict) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas není dostupný');

    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const ambient = ctx.createRadialGradient(870, 90, 20, 870, 90, 480);
    ambient.addColorStop(0, `${verdict.accent}1f`);
    ambient.addColorStop(1, 'rgba(7, 10, 15, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, WIDTH, 540);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f7f6';
    ctx.font = '900 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('SMAŽKA PROTOKOL', 58, 68);
    ctx.fillStyle = 'rgba(226, 235, 234, 0.5)';
    ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('TOXIKOLOGIE Z BENZÍNKY · 0 % DIAGNÓZA', 58, 101);

    drawFakeBarcode(ctx, 736, 42, 286, 48, verdict.caseId);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(226, 235, 234, 0.58)';
    ctx.font = '700 16px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`VZOREK #${verdict.caseId} · ${verdict.printedAt}`, 1022, 116);

    const photoX = 48;
    const photoY = 142;
    const photoWidth = 984;
    const photoHeight = 638;

    ctx.save();
    roundedRect(ctx, photoX, photoY, photoWidth, photoHeight, 32);
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
    roundedRect(ctx, photoX, photoY, photoWidth, photoHeight, 32);
    ctx.stroke();

    ctx.fillStyle = 'rgba(7, 10, 15, 0.76)';
    roundedRect(ctx, 76, 170, 292, 52, 26);
    ctx.fill();
    ctx.strokeStyle = `${verdict.accent}66`;
    ctx.stroke();
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOKÁLNÍ VZOREK', 222, 203);

    ctx.fillStyle = 'rgba(7, 10, 15, 0.82)';
    roundedRect(ctx, 76, 625, 400, 124, 28);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 19px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('SMAŽKA FAKTOR', 104, 662);
    ctx.fillStyle = '#f7faf9';
    ctx.font = '900 68px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${verdict.severity}%`, 104, 727);

    ctx.save();
    ctx.translate(786, 706);
    ctx.rotate(-0.075);
    ctx.strokeStyle = verdict.accent;
    ctx.lineWidth = 4;
    roundedRect(ctx, -224, -43, 448, 86, 12);
    ctx.stroke();
    ctx.fillStyle = verdict.accent;
    ctx.textAlign = 'center';
    ctx.font = '900 25px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(verdict.stamp, 0, 10);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = verdict.accent;
    ctx.fillRect(58, 826, 112, 7);

    ctx.fillStyle = 'rgba(226, 235, 234, 0.48)';
    ctx.font = '800 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('HLAVNÍ VERDIKT', 58, 868);

    let titleSize = 64;
    let titleLines = [];
    do {
      ctx.font = `900 ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      titleLines = lineBreaks(ctx, verdict.title, 964, 3);
      if (titleLines.length <= 2 || titleSize <= 46) break;
      titleSize -= 3;
    } while (titleSize >= 46);
    titleLines = lineBreaks(ctx, verdict.title, 964, 2);

    ctx.fillStyle = '#f7faf9';
    const titleLineHeight = Math.round(titleSize * 1.02);
    const titleHeight = drawLines(ctx, titleLines, 58, 934, titleLineHeight);
    const findingsTop = 934 + titleHeight + 28;

    ctx.fillStyle = 'rgba(226, 235, 234, 0.42)';
    ctx.font = '800 16px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('3 NEJSILNĚJŠÍ BIOMETRICKÉ NÁLEZY', 58, findingsTop);

    verdict.findings.forEach((finding, index) => {
      const y = findingsTop + 32 + index * 62;
      ctx.fillStyle = 'rgba(226, 235, 234, 0.12)';
      ctx.fillRect(58, y + 36, 964, 2);
      ctx.fillStyle = 'rgba(226, 235, 234, 0.72)';
      ctx.font = '800 20px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(finding.label, 58, y + 23);
      ctx.fillStyle = verdict.accent;
      ctx.textAlign = 'right';
      ctx.fillText(finding.value, 1022, y + 23);

      const meterWidth = 280;
      const meterX = 650;
      ctx.fillStyle = 'rgba(226, 235, 234, 0.1)';
      ctx.fillRect(meterX, y + 34, meterWidth, 4);
      ctx.fillStyle = verdict.accent;
      ctx.fillRect(meterX, y + 34, meterWidth * clamp(finding.score, 0, 100) / 100, 4);
    });

    ctx.fillStyle = 'rgba(226, 235, 234, 0.38)';
    ctx.font = '700 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FOTKA ZŮSTALA V ZAŘÍZENÍ · SATIRA, NE DIAGNÓZA', 58, 1312);
    ctx.textAlign = 'right';
    ctx.fillStyle = verdict.accent;
    ctx.font = '800 19px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('JSEMSMAZKA.CZ', 1022, 1312);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        canvas.width = 1;
        canvas.height = 1;
        if (blob) resolve(blob);
        else reject(new Error('SMAŽKA protokol se nepovedlo vyrenderovat'));
      }, 'image/jpeg', 0.94);
    });
  }

  function getCoverBlob(verdict) {
    const token = verdictToken(verdict);
    if (cachedBlob && cachedToken === token) return Promise.resolve(cachedBlob);
    if (pendingBlob && cachedToken === token) return pendingBlob;

    cachedToken = token;
    cachedBlob = null;
    const task = renderProtocolBlob(verdict)
      .then((blob) => {
        if (cachedToken === token) cachedBlob = blob;
        return blob;
      })
      .finally(() => {
        if (pendingBlob === task) pendingBlob = null;
      });
    pendingBlob = task;
    return task;
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
    link.download = 'jsem-smazka-protokol.jpg';
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
    legacyCanvas.dataset.releasedBy = 'share-v115';
  }

  async function shareCover(button) {
    const label = button.querySelector('span:last-child');
    const originalLabel = label?.textContent || 'Sdílet rozsudek';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    shareBusy = true;
    if (label) label.textContent = cachedBlob ? 'Otevírám protokol…' : 'Tisknu protokol…';

    try {
      await Promise.resolve(state.shareImagePromise).catch(() => undefined);
      const verdict = collectVerdict();
      const blob = await getCoverBlob(verdict);
      const file = new File([blob], 'jsem-smazka-protokol.jpg', { type: 'image/jpeg' });
      const shareData = {
        title: `Jsem ${verdict.title}!`,
        text: `${verdict.description} Zkus si SMAŽKA sken taky.`,
        files: [file]
      };

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        downloadBlob(blob);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Sdílení SMAŽKA protokolu selhalo:', error);
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

  const resultObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
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

  const legacyCanvasObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(releaseLegacyCanvasBuffer);
  if (legacyCanvas) {
    legacyCanvasObserver.observe(legacyCanvas, {
      attributes: true,
      attributeFilter: ['width', 'height']
    });
  }

  window.addEventListener('pagehide', () => {
    clearCoverCache();
    releaseLegacyCanvasBuffer();
    resultObserver.disconnect();
    legacyCanvasObserver.disconnect();
  }, { once: true });

  window.SmazkaShareCover = Object.freeze({
    clearCoverCache,
    collectVerdict,
    verdictToken,
    renderProtocolBlob
  });
})();

/* === result-intensity.js === */
/* Smažka v47 — map verdict severity to calm, disturbed and critical result states. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const result = app?.elements?.result || document.getElementById('result');
  const backdrop = app?.elements?.resultBackdrop || document.getElementById('resultBackdrop');
  if (!result) return;

  let lastToken = '';

  function readSeverity() {
    const stateValue = Number(app?.state?.lastAnalysisResult?.severity || app?.state?.effectSeverity);
    if (Number.isFinite(stateValue) && stateValue > 0) return Math.max(0, Math.min(100, stateValue));

    const label = result.querySelector('.effect-label strong')?.textContent || '';
    const parsed = Number.parseFloat(label.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  }

  function modeFor(severity) {
    if (severity >= 80) return 'critical';
    if (severity >= 50) return 'disturbed';
    return 'calm';
  }

  function clearIntensity() {
    lastToken = '';
    result.removeAttribute('data-intensity');
    result.style.removeProperty('--verdict-severity');
    backdrop?.removeAttribute('data-intensity');
    document.body.removeAttribute('data-result-intensity');
  }

  function applyIntensity() {
    if (result.classList.contains('hidden')) {
      clearIntensity();
      return;
    }

    const severity = readSeverity();
    const mode = modeFor(severity);
    const token = `${mode}:${Math.round(severity)}`;
    if (token === lastToken) return;
    lastToken = token;

    result.dataset.intensity = mode;
    result.style.setProperty('--verdict-severity', String(severity / 100));
    backdrop?.setAttribute('data-intensity', mode);
    document.body.dataset.resultIntensity = mode;
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    window.requestAnimationFrame(applyIntensity);
  });

  observer.observe(result, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class']
  });

  applyIntensity();

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearIntensity();
  }, { once: true });
})();

/* === junkie-polish-v55.js === */
/* Retired fallback: SmazkaFaceWarp now owns preview, final, reroll and share photo. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) return;
  if (typeof window.SmazkaFaceWarp?.renderFaceEffect === 'function') {
    window.SmazkaJunkiePolish = Object.freeze({
      version: 55,
      retiredBy: 'SmazkaFaceWarp'
    });
    return;
  }

  const { state, elements } = app;
  const result = elements.result;
  const cameraStage = elements.cameraStage;
  const preview = elements.preview;
  const WIDTH = 720;
  const HEIGHT = 960;
  const MORPH_COPY_AT = 690;
  const MORPH_COMPLETE_AT = 1080;
  const FINAL_CROSSFADE_MS = 430;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tailToken = (value) => String(value || '').slice(-56);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeRun = 0;
  let queued = false;
  let morphRun = 0;
  let morphPromise = Promise.resolve();
  let morphToken = '';
  let morphTimers = [];

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('JUNKIE polish image failed to load'));
      image.src = source;
    });
  }

  function drawCover(context, image, width, height) {
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

    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function ellipsePath(context, region) {
    context.beginPath();
    context.ellipse(
      region[0] * WIDTH,
      region[1] * HEIGHT,
      Math.max(2, region[2] * WIDTH),
      Math.max(2, region[3] * HEIGHT),
      0,
      0,
      Math.PI * 2
    );
  }

  function drawEllipseGradient(context, region, stops, alpha = 1, operation = 'multiply') {
    const x = region[0] * WIDTH;
    const y = region[1] * HEIGHT;
    const radiusX = Math.max(2, region[2] * WIDTH);
    const radiusY = Math.max(2, region[3] * HEIGHT);
    const radius = Math.max(radiusX, radiusY);

    context.save();
    context.globalCompositeOperation = operation;
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function tierIntensity(score) {
    const value = clamp(Number(score) || 0, 0, 100);
    if (value <= 30) {
      const t = value / 30;
      return { pale: 0.18 + t * 0.12, eyes: 0.08 + t * 0.1, cheeks: 0.02 * t, texture: 0.2 + t * 0.12 };
    }
    if (value <= 60) {
      const t = (value - 30) / 30;
      return { pale: 0.38 + t * 0.24, eyes: 0.32 + t * 0.36, cheeks: 0.14 + t * 0.32, texture: 0.38 + t * 0.2 };
    }
    if (value <= 85) {
      const t = (value - 60) / 25;
      return { pale: 0.68 + t * 0.22, eyes: 0.72 + t * 0.22, cheeks: 0.58 + t * 0.3, texture: 0.62 + t * 0.24 };
    }
    const t = (value - 85) / 15;
    return { pale: 0.92 + t * 0.08, eyes: 0.96 + t * 0.04, cheeks: 0.92 + t * 0.08, texture: 0.9 + t * 0.1 };
  }

  function drawSkinTone(context, source, geometry, intensity) {
    context.save();
    ellipsePath(context, geometry.face);
    context.clip();
    context.filter = `grayscale(${Math.round(16 + intensity.pale * 12)}%) saturate(${Math.round(82 - intensity.pale * 13)}%) brightness(${Math.round(97 - intensity.pale * 6)}%)`;
    context.drawImage(source, 0, 0, WIDTH, HEIGHT);
    context.filter = 'none';
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgba(34, 54, 48, ${0.07 + intensity.pale * 0.055})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.restore();
  }

  function drawUnderEye(context, eye, faceCenterX, intensity) {
    const direction = eye[0] < faceCenterX ? 1 : -1;
    const broad = [eye[0], eye[1] + eye[3] * 0.08, eye[2] * 1.08, eye[3] * 1.18];
    drawEllipseGradient(context, broad, [
      [0, 'rgba(58,46,62,0.78)'],
      [0.42, 'rgba(52,43,57,0.52)'],
      [1, 'rgba(40,35,44,0)']
    ], 0.26 + intensity.eyes * 0.46, 'multiply');

    const inner = [
      eye[0] + direction * eye[2] * 0.38,
      eye[1] - eye[3] * 0.02,
      eye[2] * 0.5,
      eye[3] * 0.7
    ];
    drawEllipseGradient(context, inner, [
      [0, 'rgba(48,38,52,0.9)'],
      [1, 'rgba(48,38,52,0)']
    ], 0.18 + intensity.eyes * 0.34, 'multiply');

    const upper = [eye[0], eye[1] - eye[3] * 1.5, eye[2] * 0.92, eye[3] * 0.58];
    drawEllipseGradient(context, upper, [
      [0, 'rgba(28,34,36,0.44)'],
      [1, 'rgba(28,34,36,0)']
    ], 0.1 + intensity.eyes * 0.17, 'multiply');
  }

  function drawCheek(context, cheek, intensity) {
    const shadow = [cheek[0], cheek[1] + cheek[3] * 0.2, cheek[2] * 1.12, cheek[3] * 1.08];
    drawEllipseGradient(context, shadow, [
      [0, 'rgba(25,34,35,0.72)'],
      [0.55, 'rgba(31,42,42,0.38)'],
      [1, 'rgba(31,42,42,0)']
    ], 0.13 + intensity.cheeks * 0.42, 'multiply');

    const bone = [cheek[0], cheek[1] - cheek[3] * 0.78, cheek[2] * 0.88, cheek[3] * 0.36];
    drawEllipseGradient(context, bone, [
      [0, 'rgba(159,183,174,0.22)'],
      [1, 'rgba(159,183,174,0)']
    ], intensity.cheeks * 0.34, 'soft-light');
  }

  function drawTexture(context, geometry, intensity, seed) {
    let value = (Number(seed) || 137) % 2147483647;
    const random = () => {
      value = (value * 48271) % 2147483647;
      return value / 2147483647;
    };

    context.save();
    ellipsePath(context, geometry.face);
    context.clip();
    context.globalCompositeOperation = 'multiply';
    const count = Math.round(90 + intensity.texture * 150);
    for (let index = 0; index < count; index += 1) {
      const x = random() * WIDTH;
      const y = random() * HEIGHT;
      const size = 0.6 + random() * 1.5;
      context.fillStyle = `rgba(17, 27, 25, ${0.012 + random() * 0.025 * intensity.texture})`;
      context.fillRect(x, y, size, size);
    }
    context.restore();
  }

  function drawLips(context, mouth, intensity, seed) {
    context.save();
    ellipsePath(context, mouth);
    context.clip();
    context.globalCompositeOperation = 'color';
    context.fillStyle = `rgba(118, 113, 112, ${0.12 + intensity.pale * 0.19})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.globalCompositeOperation = 'multiply';
    context.strokeStyle = `rgba(57, 48, 49, ${0.08 + intensity.pale * 0.13})`;
    context.lineWidth = 1;
    const centerX = mouth[0] * WIDTH;
    const centerY = mouth[1] * HEIGHT;
    const radiusX = mouth[2] * WIDTH;
    const radiusY = mouth[3] * HEIGHT;
    const phase = (Number(seed) || 0) % 11;
    for (let index = -3; index <= 3; index += 1) {
      const x = centerX + (index / 4) * radiusX + Math.sin(index + phase) * 2;
      context.beginPath();
      context.moveTo(x, centerY - radiusY * 0.34);
      context.lineTo(x + Math.sin(index * 2.1) * 3, centerY + radiusY * 0.3);
      context.stroke();
    }
    context.restore();
  }

  async function createPolishedImage(sourceData, geometry, severity, seed) {
    const image = await loadImage(sourceData);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('JUNKIE polish canvas unavailable');

    drawCover(context, image, WIDTH, HEIGHT);
    const source = document.createElement('canvas');
    source.width = WIDTH;
    source.height = HEIGHT;
    source.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0);

    const intensity = tierIntensity(severity);
    drawSkinTone(context, source, geometry, intensity);
    drawUnderEye(context, geometry.leftEye, geometry.face[0], intensity);
    drawUnderEye(context, geometry.rightEye, geometry.face[0], intensity);
    drawCheek(context, geometry.leftCheek, intensity);
    drawCheek(context, geometry.rightCheek, intensity);
    drawEllipseGradient(context, geometry.leftTemple, [[0, 'rgba(25,32,34,0.56)'], [1, 'rgba(25,32,34,0)']], intensity.cheeks * 0.22, 'multiply');
    drawEllipseGradient(context, geometry.rightTemple, [[0, 'rgba(25,32,34,0.56)'], [1, 'rgba(25,32,34,0)']], intensity.cheeks * 0.22, 'multiply');
    drawLips(context, geometry.mouth, intensity, seed);
    drawTexture(context, geometry, intensity, seed);

    return canvas.toDataURL('image/png');
  }

  function clearMorphTimers() {
    morphTimers.forEach((timer) => window.clearTimeout(timer));
    morphTimers = [];
  }

  function removeMorphNodes(visual) {
    visual?.querySelectorAll('.junkie-morph-origin, .junkie-morph-scan, .junkie-morph-halo').forEach((node) => node.remove());
  }

  function startMorph(visual, geometry, token) {
    if (morphToken === token) return morphPromise;
    morphToken = token;
    clearMorphTimers();
    removeMorphNodes(visual);
    morphRun += 1;
    const runId = morphRun;

    visual.style.setProperty('--junkie-face-x', `${geometry.face[0] * 100}%`);
    visual.style.setProperty('--junkie-face-y', `${geometry.face[1] * 100}%`);
    visual.style.setProperty('--junkie-face-rx', `${geometry.face[2] * 100}%`);
    visual.style.setProperty('--junkie-face-ry', `${geometry.face[3] * 100}%`);

    const origin = document.createElement('img');
    origin.className = 'junkie-morph-origin';
    origin.alt = '';
    origin.setAttribute('aria-hidden', 'true');
    origin.decoding = 'async';

    const scan = document.createElement('span');
    scan.className = 'junkie-morph-scan';
    scan.setAttribute('aria-hidden', 'true');

    const halo = document.createElement('span');
    halo.className = 'junkie-morph-halo';
    halo.setAttribute('aria-hidden', 'true');

    visual.append(origin, halo, scan);
    result.classList.remove('junkie-morph-running', 'junkie-morph-copy-ready', 'junkie-morph-complete');
    result.classList.add('junkie-morph-preparing');

    morphPromise = new Promise((resolve) => {
      let began = false;
      const begin = () => {
        if (began) return;
        began = true;
        if (runId !== morphRun) return resolve();
        window.requestAnimationFrame(() => {
          if (runId !== morphRun) return resolve();
          result.classList.add('junkie-morph-running');
        });

        morphTimers.push(window.setTimeout(() => {
          if (runId === morphRun) result.classList.add('junkie-morph-copy-ready');
        }, MORPH_COPY_AT));

        morphTimers.push(window.setTimeout(() => {
          if (runId === morphRun) {
            result.classList.remove('junkie-morph-preparing', 'junkie-morph-running');
            result.classList.add('junkie-morph-complete', 'junkie-morph-copy-ready');
            removeMorphNodes(visual);
          }
          resolve();
        }, MORPH_COMPLETE_AT));
      };

      if (reducedMotion()) {
        result.classList.remove('junkie-morph-preparing');
        result.classList.add('junkie-morph-complete', 'junkie-morph-copy-ready');
        removeMorphNodes(visual);
        resolve();
        return;
      }

      origin.addEventListener('load', begin, { once: true });
      origin.addEventListener('error', begin, { once: true });
      origin.src = state.currentImageData;
      if (origin.complete) window.queueMicrotask(begin);
    });

    return morphPromise;
  }

  async function installImage(visual, source, token, runId) {
    const image = document.createElement('img');
    image.className = 'junkie-polished-image junkie-morph-final';
    image.alt = `Forenzně deformovaný obličej. JUNKIE efekt ${Math.round(Number(state.effectSeverity) || 0)} procent.`;
    image.decoding = 'async';

    const loaded = new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });

    image.src = source;
    visual.appendChild(image);
    await loaded;
    if (runId !== activeRun || result.dataset.junkiePolishToken !== token) {
      image.remove();
      return;
    }

    await morphPromise;
    if (runId !== activeRun || result.dataset.junkiePolishToken !== token) {
      image.remove();
      return;
    }

    if (reducedMotion()) {
      visual.querySelectorAll('canvas, img').forEach((node) => {
        if (node !== image) node.remove();
      });
      visual.classList.add('is-junkie-polished');
      return;
    }

    visual.classList.add('junkie-polish-crossfading');
    window.requestAnimationFrame(() => visual.classList.add('junkie-polish-committing'));
    await new Promise((resolve) => window.setTimeout(resolve, FINAL_CROSSFADE_MS));

    if (runId !== activeRun || result.dataset.junkiePolishToken !== token) return;
    visual.querySelectorAll('canvas, img').forEach((node) => {
      if (node !== image) node.remove();
    });
    removeMorphNodes(visual);
    visual.classList.remove('junkie-polish-crossfading', 'junkie-polish-committing');
    visual.classList.add('is-junkie-polished');
  }

  function keepOriginalDuringBridge() {
    if (!cameraStage?.classList.contains('is-revealing-result') || !preview || !state.currentImageData) return;
    if (preview.getAttribute('src') !== state.currentImageData) preview.setAttribute('src', state.currentImageData);
  }

  function queuePolish() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      polishResult();
    });
  }

  function polishResult() {
    if (result.classList.contains('hidden') || !state.currentImageData) return;
    const snapshot = state.junkieLandmarkSnapshot;
    const visual = result.querySelector('.result-visual.effect-junkie-forensic');
    if (!snapshot || snapshot.token !== tailToken(state.currentImageData) || !visual) return;

    const severity = clamp(Number(state.effectSeverity || state.lastAnalysisResult?.severity || state.visualDamageSeverity || 50), 0, 100);
    const seed = Number(state.effectSeed || state.visualDamageSeverity * 997 || 137);
    const token = `${snapshot.token}|${Math.round(severity)}|${seed}|v55`;
    if (result.dataset.junkiePolishToken === token) return;
    result.dataset.junkiePolishToken = token;
    const runId = ++activeRun;

    startMorph(visual, snapshot.geometry, token);

    const basePromise = Promise.resolve(state.shareImagePromise).catch(() => state.effectImageData);
    const polishedPromise = basePromise
      .then((baseImage) => {
        if (runId !== activeRun) return baseImage;
        const source = baseImage || state.effectImageData;
        if (!source) throw new Error('Base JUNKIE render unavailable');
        return createPolishedImage(source, snapshot.geometry, severity, seed);
      })
      .then(async (polishedImage) => {
        if (runId !== activeRun || !polishedImage) return polishedImage;
        state.effectImageData = polishedImage;
        await installImage(visual, polishedImage, token, runId);
        return polishedImage;
      })
      .catch((error) => {
        console.warn('JUNKIE forensic polish failed:', error);
        return state.effectImageData;
      });

    state.shareImagePromise = polishedPromise;
  }

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(queuePolish);
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-junkie-token']
  });

  const bridgeObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(keepOriginalDuringBridge);
  if (cameraStage) bridgeObserver.observe(cameraStage, { attributes: true, attributeFilter: ['class'] });
  if (preview) bridgeObserver.observe(preview, { attributes: true, attributeFilter: ['src'] });

  queuePolish();
  window.addEventListener('pagehide', () => {
    activeRun += 1;
    morphRun += 1;
    clearMorphTimers();
    observer.disconnect();
    bridgeObserver.disconnect();
  }, { once: true });
})();

/* === boot-message-v54.js === */
/* Smažka v54 — one quiet boot/scan message instead of duplicated branding. */
(() => {
  'use strict';

  const copy = document.querySelector('.boot-message-copy');
  if (!copy) return;

  const messages = [
    'SKENUJI ÚROVEŇ SMAŽKY',
    'PŘIPRAV KSICHT NA VERDIKT',
    'DETEKCE SMAŽKY: STANDBY',
    'ANALÝZA OBLIČEJE // ČEKÁM',
    'SCAN READY — UKAŽ TVÁŘ',
    'NAČÍTÁM STUPEŇ ZKÁZY'
  ];

  function randomIndex(max) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % max;
  }

  let previous = -1;
  function selectMessage() {
    let index = randomIndex(messages.length);
    if (messages.length > 1 && index === previous) index = (index + 1) % messages.length;
    previous = index;
    copy.textContent = messages[index];
  }

  selectMessage();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) selectMessage();
  });
})();

/* === result-close-reset-v58.js === */
/* Smažka v58 — closing a verdict always returns to a clean, usable scanner. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const result = app?.elements?.result || document.getElementById('result');
  const backdrop = app?.elements?.resultBackdrop || document.getElementById('resultBackdrop');
  if (!result) return;

  let resetting = false;

  async function resetToScanner() {
    if (resetting) return;
    resetting = true;

    try {
      /* Reuse the app's own reset path whenever the rendered button exists. */
      const newScanButton = result.querySelector('.new-scan-button');
      if (newScanButton && !newScanButton.disabled) {
        newScanButton.click();
        return;
      }

      /* Defensive fallback for an incomplete result DOM. */
      app?.hideResult?.();
      window.SmazkaFaceScan?.reset?.();
      app?.clearCurrentImage?.();
      app?.clearErrors?.();
      app?.setBusy?.(false);

      const elements = app?.elements;
      elements?.retakeButton?.classList.add('hidden');
      elements?.analyzeButton?.classList.remove('hidden');
      elements?.uploadButton?.classList.remove('hidden');
      await app?.initCamera?.();
      window.requestAnimationFrame(() => elements?.analyzeButton?.focus({ preventScroll: true }));
    } finally {
      window.setTimeout(() => {
        resetting = false;
      }, 300);
    }
  }

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest?.('.result-close');
    const clickedBackdrop = backdrop && event.target === backdrop;
    if (!closeButton && !clickedBackdrop) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    resetToScanner();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || result.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    resetToScanner();
  }, true);
})();
