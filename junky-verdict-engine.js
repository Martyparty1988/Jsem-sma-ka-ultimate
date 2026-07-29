/* Junky Verdict Engine v75. Metadata-driven local satire; not medical or drug-use detection. */
(() => {
  'use strict';
  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements || typeof app.runAnalysis !== 'function') return;

  const { state, elements } = app;
  const originalRunAnalysis = app.runAnalysis.bind(app);
  const PACK_URL = 'responses-pernik.json?v=64';
  const MATCHER_URL = './verdict-matcher.js?v=64';
  const RECENT_LIMIT = 5;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tierFor = (score) => score < 35 ? 'low' : score < 58 ? 'worn' : score < 78 ? 'junky' : 'critical';
  let engineBusy = false;
  let packPromise;
  let matcherPromise;
  let microcopyQueued = false;
  let metadataWarningIssued = false;

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomUnit() {
    if (!window.crypto?.getRandomValues) return Math.random();
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] / 0xffffffff;
  }

  function normalizeDevastationMetrics(metrics) {
    if (!metrics || typeof metrics !== 'object') return null;

    const apertura = Number(metrics.apertura);
    const lidskost = Number(metrics.lidskost);
    const gravitace = Number(metrics.gravitace);
    const hydratace = Number(metrics.hydratace);
    const asymetrie = String(metrics.asymetrie || '').trim().toLocaleLowerCase('cs-CZ');

    if (
      !Number.isFinite(apertura)
      || !Number.isFinite(lidskost)
      || !Number.isFinite(gravitace)
      || !Number.isFinite(hydratace)
      || !['nízká', 'střední', 'vysoká'].includes(asymetrie)
    ) return null;

    return Object.freeze({
      apertura: clamp(apertura, 0, 100),
      lidskost: clamp(lidskost, 0, 100),
      gravitace: clamp(gravitace, 0, 45),
      asymetrie,
      hydratace: clamp(hydratace, 0, 100)
    });
  }

  function normalizeFaceAnalysis(faceAnalysis, metrics) {
    if (!faceAnalysis || typeof faceAnalysis !== 'object' || !metrics) return null;
    if (!Array.isArray(faceAnalysis.normalizedLandmarks) || faceAnalysis.normalizedLandmarks.length < 468) {
      return null;
    }
    return faceAnalysis;
  }

  function loadMatcher() {
    matcherPromise ||= import(MATCHER_URL);
    return matcherPromise;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Obrázek se nepovedlo dekódovat'));
      image.src = source;
    });
  }

  function drawCover(context, image, width, height) {
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
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function pointDistance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function landmarkSignals() {
    const points = new Map();
    document.querySelectorAll('.face-landmark-mesh circle.landmark').forEach((circle) => {
      if (circle.hidden) return;
      const index = Number(circle.dataset.index);
      const x = Number(circle.getAttribute('cx'));
      const y = Number(circle.getAttribute('cy'));
      if (Number.isFinite(index) && Number.isFinite(x) && Number.isFinite(y)) points.set(index, { x, y });
    });
    if (points.size < 8) return null;

    const rightWidth = pointDistance(points.get(33), points.get(133));
    const leftWidth = pointDistance(points.get(263), points.get(362));
    const rightOpen = rightWidth ? pointDistance(points.get(159), points.get(145)) / rightWidth : 0.2;
    const leftOpen = leftWidth ? pointDistance(points.get(386), points.get(374)) / leftWidth : 0.2;
    const eyeOpen = (rightOpen + leftOpen) / 2;
    const eyeAsymmetry = Math.abs(rightOpen - leftOpen) / Math.max(0.04, eyeOpen);
    const rightCenter = { x: ((points.get(33)?.x || 0) + (points.get(133)?.x || 0)) / 2, y: ((points.get(33)?.y || 0) + (points.get(133)?.y || 0)) / 2 };
    const leftCenter = { x: ((points.get(263)?.x || 0) + (points.get(362)?.x || 0)) / 2, y: ((points.get(263)?.y || 0) + (points.get(362)?.y || 0)) / 2 };
    const eyeDistance = pointDistance(rightCenter, leftCenter);
    const mouthWidth = pointDistance(points.get(61), points.get(291));

    return {
      sleepy: clamp((0.22 - eyeOpen) / 0.14, 0, 1),
      asymmetry: clamp(eyeAsymmetry / 0.8, 0, 1),
      tilt: clamp((eyeDistance ? Math.abs(rightCenter.y - leftCenter.y) / eyeDistance : 0) / 0.16, 0, 1),
      mouth: clamp((mouthWidth ? pointDistance(points.get(13), points.get(14)) / mouthWidth : 0) / 0.22, 0, 1)
    };
  }

  async function computeSeverity(imageData) {
    const image = await loadImage(imageData);
    const width = 96;
    const height = 112;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    drawCover(context, image, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luma = new Float32Array(width * height);
    let sum = 0;
    let squares = 0;
    let saturation = 0;
    let dark = 0;
    let highlights = 0;
    let red = 0;
    let left = 0;
    let right = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = (y * width + x) * 4;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        const value = r * 0.2126 + g * 0.7152 + b * 0.0722;
        luma[y * width + x] = value;
        sum += value;
        squares += value * value;
        saturation += Math.max(r, g, b) - Math.min(r, g, b);
        if (value < 58) dark += 1;
        if (value > 218) highlights += 1;
        red += Math.max(0, r - (g + b) / 2);
        if (x < width / 2) left += value;
        else right += value;
      }
    }

    let edge = 0;
    let edgeCount = 0;
    for (let y = 1; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        const current = luma[y * width + x];
        edge += Math.abs(current - luma[y * width + x - 1]);
        edge += Math.abs(current - luma[(y - 1) * width + x]);
        edgeCount += 2;
      }
    }

    const count = width * height;
    const mean = sum / count;
    const deviation = Math.sqrt(Math.max(0, squares / count - mean * mean));
    const signals = landmarkSignals();
    let score = 23;
    score += clamp((deviation - 28) / 52, 0, 1) * 15;
    score += clamp((dark / count) / 0.42, 0, 1) * 15;
    score += clamp((highlights / count) / 0.32, 0, 1) * 4;
    score += clamp((saturation / count - 24) / 78, 0, 1) * 6;
    score += clamp((red / count - 3) / 24, 0, 1) * 8;
    score += clamp(Math.abs(left - right) / (count / 2) / 34, 0, 1) * 10;
    score += clamp((17 - edge / edgeCount) / 17, 0, 1) * 7;
    if (signals) score += signals.sleepy * 11 + signals.asymmetry * 8 + signals.tilt * 6 + signals.mouth * 4;
    score += ((hashText(String(imageData).slice(-320)) % 1001) / 1000 - 0.5) * 10;
    return clamp(Math.round(score), 16, 94);
  }

  async function waitForStableLibrary(timeout = 2200) {
    const started = performance.now();
    let previous = -1;
    let stable = 0;
    while (performance.now() - started < timeout) {
      const length = Array.isArray(state.responseLibrary) ? state.responseLibrary.length : 0;
      stable = length >= 4 && length === previous ? stable + 1 : 0;
      if (stable >= 3) return;
      previous = length;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function loadPack() {
    if (packPromise) return packPromise;
    packPromise = (async () => {
      try {
        const response = await fetch(PACK_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pack = await response.json();
        if (!Array.isArray(pack)) throw new Error('Perníkovej pack nemá správný formát');
        await waitForStableLibrary();
        const known = new Set(state.responseLibrary.map((item) => `${item.category}|${item.description}`));
        pack.forEach((item) => {
          const key = `${item?.category}|${item?.description}`;
          if (item?.category && item?.description && !known.has(key)) {
            state.responseLibrary.push(item);
            known.add(key);
          }
        });
      } catch (error) {
        console.warn('Perníkovej hardcore pack se nepovedlo načíst:', error);
      }
    })();
    return packPromise;
  }

  async function runTieredAnalysis(options = {}) {
    if (engineBusy || state.isAnalyzing) return;
    if (!state.currentImageData && !options.skipImageCheck) {
      app.showError('Nejdřív dodej ksicht. Bez důkazního materiálu perníkovej tribunál jen čumí do zdi.');
      return;
    }
    engineBusy = true;
    app.setBusy(true);
    elements.loading?.classList.remove('hidden');
    app.setHint('Pitevní algoritmus počítá tiky a zbytky lidskosti…');
    try {
      await loadPack();
      await waitForStableLibrary(900);
      const metrics = normalizeDevastationMetrics(options.faceAnalysis?.metrics || options.metrics);
      const faceAnalysis = normalizeFaceAnalysis(options.faceAnalysis, metrics);
      let severity;

      if (metrics) {
        const measuredSeverity = Number(faceAnalysis?.scores?.severity);
        severity = Number.isFinite(measuredSeverity)
          ? clamp(Math.round(measuredSeverity), 12, 98)
          : clamp(Math.round(100 - metrics.lidskost), 16, 94);
      } else {
        severity = await computeSeverity(state.currentImageData).catch((error) => {
          console.warn('Vizuální damage skóre selhalo, používám fallback:', error);
          return 36 + (hashText(String(state.currentImageData).slice(-220)) % 48);
        });
      }

      const {
        hasValidResponseMetadata,
        selectVerdictByMetadata
      } = await loadMatcher();
      const responses = Array.from(state.responseLibrary || [])
        .filter((item) => item?.category && item?.description);
      const invalidMetadata = responses.filter((item) => !hasValidResponseMetadata(item));
      if (invalidMetadata.length && !metadataWarningIssued) {
        metadataWarningIssued = true;
        console.warn(
          `Přeskakuju ${invalidMetadata.length} verdiktů bez explicitních severity/effect/signals metadat.`,
          invalidMetadata.map((item) => item.id || item.category)
        );
      }
      const recent = Array.isArray(state.junkyRecentCategories)
        ? state.junkyRecentCategories
        : [];
      const selected = selectVerdictByMetadata({
        severity,
        signals: faceAnalysis?.signals,
        metrics,
        responses,
        recentCategories: recent,
        random: randomUnit
      });
      if (!selected) throw new Error('Knihovna verdiktů je prázdná');
      state.junkyRecentCategories = [
        ...new Set([selected.category, ...recent])
      ].slice(0, RECENT_LIMIT);

      const selectedFaceAnalysis = faceAnalysis
        ? {
            ...faceAnalysis,
            selection: {
              responseId: selected.id || '',
              category: selected.category,
              severity,
              severityRange: { ...selected.severity },
              effect: selected.effect,
              signals: [...selected.signals]
            }
          }
        : null;
      state.visualDamageSeverity = severity;
      state.visualDamageTier = tierFor(severity);
      state.lastDevastationMetrics = metrics;
      state.faceAnalysis = selectedFaceAnalysis;
      app.setBusy(false);
      originalRunAnalysis({
        ...options,
        severity,
        verdict: selected,
        faceAnalysis: selectedFaceAnalysis
      });
    } finally {
      engineBusy = false;
      if (!state.isAnalyzing) app.setBusy(false);
    }
  }

  async function optimizeUpload(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Nahraj obrázek, ne dokument');
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Soubor se nepovedlo přečíst'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const image = await loadImage(source);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  async function interceptUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    elements.uploadButton.disabled = true;
    elements.analyzeButton.disabled = true;
    try {
      const imageData = await optimizeUpload(file);
      app.setCurrentImageData(imageData);
      app.showCapturedFrame();
      elements.captureButton.classList.add('hidden');
      elements.retakeButton.classList.remove('hidden');
      elements.analyzeButton.classList.remove('hidden');
      app.hideResult();
      app.clearErrors();
      if (typeof window.SmazkaFaceScan?.analyzeStillImage !== 'function') {
        throw new Error('MediaPipe modul pro nahranou fotku není dostupný.');
      }
      const faceAnalysis = await window.SmazkaFaceScan.analyzeStillImage(imageData);
      await runTieredAnalysis({
        metrics: faceAnalysis.metrics,
        faceAnalysis
      });
    } catch (error) {
      if (error?.code) console.warn('Perníkovej upload odmítl vstup:', error);
      else console.error('Perníkovej upload se nepovedl:', error);
      app.showError(
        error?.code
          ? error.message
          : 'Fotka se nepovedla změřit. Zkus jinou, tahle odmítla vypovídat.'
      );
      app.setHint('Pro biometrický verdikt potřebuju jednu jasnou tvář.');
    } finally {
      event.target.value = '';
      if (!state.isAnalyzing) {
        elements.uploadButton.disabled = false;
        elements.analyzeButton.disabled = false;
      }
    }
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function replaceExact(element, replacements) {
    if (!element) return;
    const value = replacements[element.textContent.trim()];
    if (value) setText(element, value);
  }

  function polishMicrocopy() {
    microcopyQueued = false;
    replaceExact(elements.scanHint, {
      'VOID engine pitvá obraz a hledá zbytky člověka…': 'Pitevní algoritmus počítá tiky a zbytky lidskosti…',
      'Podsvětí tiskne rozsudek přímo do ksichtu…': 'Perníkovej tribunál tiskne rozsudek přímo do ksichtu…',
      'Rozsudek je venku. Sdílej ostudu, nebo přiveď další subjekt.': 'Rozsudek venku. Sdílej důkazní materiál, nebo přiveď další trosku.'
    });
    replaceExact(document.querySelector('.scan-state-copy'), {
      'Zamykám subjekt': 'Zamykám obličejovej důkaz',
      'Oči nalezeny • soudnost ne': 'Zorničky nalezeny • člověk ne',
      'Nos a ústa pod dohledem': 'Čelist a nos na výslechu',
      'Kontura trosek hotová': 'Perníkovej profil uzamčen',
      'Vážím zbytky důstojnosti': 'Počítám tiky a cizí zapalovače',
      'Rozpad potvrzen': 'Biologická reklamace potvrzena'
    });

    const reveal = document.querySelector('.result-reveal-title');
    if (reveal && state.visualDamageTier) setText(reveal, {
      low: 'Podezřele funkční', worn: 'Čelist na přesčase', junky: 'Perníkovej rozpad potvrzen', critical: 'Člověk nenalezen'
    }[state.visualDamageTier]);

    const details = elements.result.querySelector('.in-frame-details-label');
    if (details) setText(details, elements.result.classList.contains('details-open') ? 'Skrýt pitevní zprávu' : 'Otevřít pitevní zprávu');
    const heading = elements.result.querySelector('.diagnostic-heading');
    if (heading) {
      setText(heading.querySelector('strong'), 'PITEVNÍ AI ROZBOR');
      setText(heading.querySelector('small'), '100% nevědecký · 0% diagnóza');
    }
    const labels = {
      'Stabilita zorniček': 'Zorničky pod dohledem',
      'Kontakt s realitou': 'Signál z planety Země',
      'Koordinace pohybu': 'Schopnost dojít bez svědků',
      'Pravděpodobnost příchodu domů': 'Šance poznat vlastní adresu',
      'Riziko ztráty klíčů': 'Klíče už mají nového majitele',
      'Zbytková důstojnost': 'Zbytková lidskost',
      'Mozkový ping': 'Odezva posledního neuronu'
    };
    elements.result.querySelectorAll('.diagnostic-copy span').forEach((label) => replaceExact(label, labels));
    elements.result.querySelectorAll('.result-tool-button span').forEach((label) => replaceExact(label, {
      'Jiná deformace': 'Další porucha',
      'Ještě víc mě znič': 'Dorazit zbytky'
    }));
    if (!elements.result.classList.contains('hidden')) {
      if (elements.result.dataset.verdictTier !== (state.visualDamageTier || 'worn')) elements.result.dataset.verdictTier = state.visualDamageTier || 'worn';
      const score = String(state.visualDamageSeverity || '');
      if (elements.result.dataset.visualDamage !== score) elements.result.dataset.visualDamage = score;
    }
  }

  function queuePolish() {
    if (microcopyQueued) return;
    microcopyQueued = true;
    window.queueMicrotask(polishMicrocopy);
  }

  app.runAnalysis = runTieredAnalysis;
  elements.uploadInput.addEventListener('change', interceptUpload, true);
  elements.analyzeButton.addEventListener('click', (event) => {
    if (window.SmazkaFaceScan?.start) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runTieredAnalysis();
  }, true);

  const observer = new MutationObserver(queuePolish);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  loadPack();
  queuePolish();
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();