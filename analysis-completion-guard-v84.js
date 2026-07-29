/* Smažka v84 — guarantee that analysis always reaches an interactive result. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const state = app?.state;
  const elements = app?.elements;
  const result = elements?.result;
  const stage = elements?.cameraStage;
  if (!state || !elements?.app || !result || !stage) return;

  const WARP_TIMEOUT_MS = 2400;
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
    stage.classList.remove(...revealClasses);
    stage.querySelector('.result-reveal-overlay')?.setAttribute('aria-hidden', 'true');
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

  function patchFaceWarp() {
    const faceWarp = window.SmazkaFaceWarp;
    if (!faceWarp || typeof faceWarp.renderFaceEffect !== 'function' || faceWarp.__completionGuardV84) return;
    const nativeRender = faceWarp.renderFaceEffect.bind(faceWarp);

    async function guardedRender(options = {}) {
      let timer = 0;
      const fallback = new Promise((resolve) => {
        timer = window.setTimeout(() => {
          const profile = effectProfile({ effect: options.effect });
          resolve({
            previewDataUrl: options.imageData,
            finalDataUrl: options.imageData,
            renderer: 'timeout-fallback-v84',
            effect: typeof options.effect === 'string' ? options.effect : profile.key,
            label: profile.label || 'Nouzový VOID efekt',
            seed: Number(options.seed) || Number(state.effectSeed) || 1,
            anchored: Boolean(options.faceAnalysis?.anchors),
            crop: 'cover',
            timedOut: true
          });
        }, WARP_TIMEOUT_MS);
      });

      try {
        return await Promise.race([nativeRender(options), fallback]);
      } finally {
        window.clearTimeout(timer);
      }
    }

    window.SmazkaFaceWarp = Object.freeze({
      ...faceWarp,
      renderFaceEffect: guardedRender,
      __completionGuardV84: true
    });
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

  patchFaceWarp();

  const observer = new MutationObserver(syncLifecycle);
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
    warpTimeoutMs: WARP_TIMEOUT_MS,
    analysisTimeoutMs: ANALYSIS_TIMEOUT_MS,
    revealTimeoutMs: REVEAL_TIMEOUT_MS,
    recoverNow() {
      const sequence = ++recoverySequence;
      return recoverAnalysis(sequence);
    }
  });

  syncLifecycle();
})();
