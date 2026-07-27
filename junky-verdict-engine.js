/*
 * Junky Verdict Engine v40
 * Satirical, local-only visual damage scoring. This is not medical or drug-use detection.
 */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements || typeof app.runAnalysis !== 'function') return;

  const { state, elements } = app;
  const originalRunAnalysis = app.runAnalysis.bind(app);
  const PACK_URL = 'responses-pernik.json?v=40';
  const RECENT_LIMIT = 5;
  const LOCKED_LIBRARY_LENGTH = 101;
  const severityBounds = [16, 94];
  let engineBusy = false;
  let packPromise = null;
  let resultObserver = null;
  let microcopyQueued = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tierForSeverity = (severity) => (
    severity < 35 ? 'low' : severity < 58 ? 'worn' : severity < 78 ? 'junky' : 'critical'
  );

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
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

  function distance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
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

  function readLandmarkSignals() {
    const points = new Map();
    document.querySelectorAll('.face-landmark-mesh circle.landmark').forEach((circle) => {
      if (circle.hidden) return;
      const index = Number(circle.dataset.index);
      const x = Number(circle.getAttribute('cx'));
      const y = Number(circle.getAttribute('cy'));
      if (Number.isFinite(index) && Number.isFinite(x) && Number.isFinite(y)) {
        points.set(index, { x, y });
      }
    });

    if (points.size < 8) return null;

    const rightEyeWidth = distance(points.get(33), points.get(133));
    const leftEyeWidth = distance(points.get(263), points.get(362));
    const rightEyeOpen = rightEyeWidth ? distance(points.get(159), points.get(145)) / rightEyeWidth : 0.2;
    const leftEyeOpen = leftEyeWidth ? distance(points.get(386), points.get(374)) / leftEyeWidth : 0.2;
    const averageEyeOpen = (rightEyeOpen + leftEyeOpen) / 2;
    const eyeAsymmetry = Math.abs(rightEyeOpen - leftEyeOpen) / Math.max(0.04, averageEyeOpen);

    const rightEyeCenter = {
      x: ((points.get(33)?.x || 0) + (points.get(133)?.x || 0)) / 2,
      y: ((points.get(33)?.y || 0) + (points.get(133)?.y || 0)) / 2
    };
    const leftEyeCenter = {
      x: ((points.get(263)?.x || 0) + (points.get(362)?.x || 0)) / 2,
      y: ((points.get(263)?.y || 0) + (points.get(362)?.y || 0)) / 2
    };
    const eyeDistance = distance(rightEyeCenter, leftEyeCenter);
    const tilt = eyeDistance ? Math.abs(rightEyeCenter.y - leftEyeCenter.y) / eyeDistance : 0;

    const mouthWidth = distance(points.get(61), points.get(291));
    const mouthOpen = mouthWidth ? distance(points.get(13), points.get(14)) / mouthWidth : 0;

    return {
      sleepy: clamp((0.22 - averageEyeOpen) / 0.14, 0, 1),
      eyeAsymmetry: clamp(eyeAsymmetry / 0.8, 0, 1),
      tilt: clamp(tilt / 0.16, 0, 1),
      mouthOpen: clamp(mouthOpen / 0.22, 0, 1)
    };
  }

  async function computeVisualSeverity(imageData) {
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
    let sumSquares = 0;
    let saturation = 0;
    let darkness = 0;
    let highlights = 0;
    let redCast = 0;
    let leftSum = 0;
    let rightSum = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = (y * width + x) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];
        const value = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const targetIndex = y * width + x;
        luma[targetIndex] = value;
        sum += value;
        sumSquares += value * value;
        saturation += Math.max(r, g, b) - Math.min(r, g, b);
        if (value < 58) darkness += 1;
        if (value > 218) highlights += 1;
        redCast += Math.max(0, r - (g + b) / 2);
        if (x < width / 2) {
          leftSum += value;
          leftCount += 1;
        } else {
          rightSum += value;
          rightCount += 1;
        }
      }
    }

    let edgeEnergy = 0;
    let edgeCount = 0;
    for (let y = 1; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        const current = luma[y * width + x];
        edgeEnergy += Math.abs(current - luma[y * width + x - 1]);
        edgeEnergy += Math.abs(current - luma[(y - 1) * width + x]);
        edgeCount += 2;
      }
    }

    const count = width * height;
    const mean = sum / count;
    const deviation = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
    const darkRatio = darkness / count;
    const highlightRatio = highlights / count;
    const saturationMean = saturation / count;
    const redMean = redCast / count;
    const asymmetry = Math.abs(leftSum / leftCount - rightSum / rightCount);
    const edges = edgeEnergy / edgeCount;
    const landmarks = readLandmarkSignals();
    const jitter = ((hashText(String(imageData).slice(-320)) % 1001) / 1000 - 0.5) * 10;

    let score = 23;
    score += clamp((deviation - 28) / 52, 0, 1) * 15;
    score += clamp(darkRatio / 0.42, 0, 1) * 15;
    score += clamp(highlightRatio / 0.32, 0, 1) * 4;
    score += clamp((saturationMean - 24) / 78, 0, 1) * 6;
    score += clamp((redMean - 3) / 24, 0, 1) * 8;
    score += clamp(asymmetry / 34, 0, 1) * 10;
    score += clamp((17 - edges) / 17, 0, 1) * 7;

    if (landmarks) {
      score += landmarks.sleepy * 11;
      score += landmarks.eyeAsymmetry * 8;
      score += landmarks.tilt * 6;
      score += landmarks.mouthOpen * 4;
    }

    score += jitter;
    return clamp(Math.round(score), severityBounds[0], severityBounds[1]);
  }

  function inferMetadata(item, index, total) {
    const category = String(item?.category || '');
    const description = String(item?.description || '');
    const text = `${category} ${description}`.toLocaleLowerCase('cs-CZ');
    const explicitMin = Number(item?.minSeverity);
    const explicitMax = Number(item?.maxSeverity);
    let minSeverity = Number.isFinite(explicitMin) ? explicitMin : 28;
    let maxSeverity = Number.isFinite(explicitMax) ? explicitMax : 82;
    let tier = item?.tier || 'worn';
    const tags = Array.isArray(item?.tags) ? [...item.tags] : [];

    if (!Number.isFinite(explicitMin) || !Number.isFinite(explicitMax)) {
      const position = total > 1 ? index / (total - 1) : 0.5;
      if (/startovní|podezřele funkční|čistá lajna|mikrotrip|svěží/.test(text)) {
        minSeverity = 16;
        maxSeverity = 38;
        tier = 'low';
      } else if (/kontejner|likvidaci|odpad|zombie|exekutor|expiraci|finální boss|člověk nenalezen|biologick|vypnutej|pekla|úpadek|rozpad|kyselina|dávkovací omyl/.test(text)) {
        minSeverity = 72;
        maxSeverity = 98;
        tier = 'critical';
      } else if (/piko|pika|perník|varna|čelist|paranoi|trosk|třídenní|nespací/.test(text)) {
        minSeverity = Math.max(42, Math.round(42 + position * 18));
        maxSeverity = 96;
        tier = position > 0.68 ? 'critical' : 'junky';
        if (!tags.includes('pernik')) tags.push('pernik');
      } else {
        minSeverity = Math.round(20 + position * 34);
        maxSeverity = Math.round(58 + position * 38);
        tier = position < 0.3 ? 'low' : position > 0.72 ? 'junky' : 'worn';
      }
    }

    return {
      ...item,
      tier,
      minSeverity: clamp(Math.round(minSeverity), 16, 98),
      maxSeverity: clamp(Math.round(maxSeverity), 16, 98),
      tags,
      weight: clamp(Number(item?.weight) || 1, 0.2, 5)
    };
  }

  function recentCategories() {
    if (!Array.isArray(state.junkyRecentCategories)) state.junkyRecentCategories = [];
    return state.junkyRecentCategories;
  }

  function weightedPick(items, severity) {
    const recent = new Set(recentCategories());
    const weighted = items.map((item) => {
      const center = (item.minSeverity + item.maxSeverity) / 2;
      const range = Math.max(8, item.maxSeverity - item.minSeverity);
      const fit = 1.4 - Math.min(1, Math.abs(severity - center) / range);
      const pernikBoost = item.tags.includes('pernik') ? (severity >= 58 ? 2.35 : 1.55) : 1;
      const hardBoost = item.tags.includes('hard') ? 1.25 : 1;
      const repeatPenalty = recent.has(item.category) ? 0.06 : 1;
      return { item, weight: Math.max(0.01, item.weight * fit * pernikBoost * hardBoost * repeatPenalty) };
    });
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = randomUnit() * total;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry.item;
    }
    return weighted.at(-1)?.item || items[0];
  }

  function selectVerdict(severity) {
    const library = Array.from(state.responseLibrary || []);
    const normalized = library
      .filter((item) => item?.category && item?.description)
      .map((item, index) => inferMetadata(item, index, library.length));
    const exact = normalized.filter((item) => severity >= item.minSeverity && severity <= item.maxSeverity);
    const candidates = exact.length ? exact : normalized
      .map((item) => ({ item, distance: Math.min(Math.abs(severity - item.minSeverity), Math.abs(severity - item.maxSeverity)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.max(6, Math.ceil(normalized.length * 0.18)))
      .map((entry) => entry.item);
    const selected = weightedPick(candidates, severity);
    const recent = recentCategories();
    recent.unshift(selected.category);
    state.junkyRecentCategories = [...new Set(recent)].slice(0, RECENT_LIMIT);
    return selected;
  }

  function makeSeverityLockedLibrary(selected, severity) {
    const targetIndex = clamp(
      Math.round(((severity - 16) / 78) * (LOCKED_LIBRARY_LENGTH - 1)),
      0,
      LOCKED_LIBRARY_LENGTH - 1
    );
    const library = new Array(LOCKED_LIBRARY_LENGTH).fill(selected);
    Object.defineProperty(library, 'findIndex', {
      configurable: true,
      value: () => targetIndex
    });
    return library;
  }

  async function waitForStableLibrary(timeout = 2200) {
    const started = performance.now();
    let previous = -1;
    let stable = 0;
    while (performance.now() - started < timeout) {
      const length = Array.isArray(state.responseLibrary) ? state.responseLibrary.length : 0;
      if (length >= 4 && length === previous) stable += 1;
      else stable = 0;
      if (stable >= 3) return;
      previous = length;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function loadPernikPack() {
    if (packPromise) return packPromise;
    packPromise = (async () => {
      try {
        const response = await fetch(PACK_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pack = await response.json();
        if (!Array.isArray(pack)) throw new Error('Perníkovej pack nemá správný formát');
        await waitForStableLibrary();
        const library = state.responseLibrary;
        const known = new Set(library.map((item) => `${item.category}|${item.description}`));
        pack.forEach((item) => {
          const key = `${item?.category}|${item?.description}`;
          if (item?.category && item?.description && !known.has(key)) {
            library.push(item);
            known.add(key);
          }
        });
      } catch (error) {
        console.warn('Perníkovej hardcore pack se nepovedlo načíst:', error);
      }
    })();
    return packPromise;
  }

  function restoreLibraryWhenReady(originalLibrary, lockedLibrary) {
    let restored = false;
    const observer = new MutationObserver(() => {
      if (!elements.result.classList.contains('hidden') && elements.result.querySelector('.result-content')) restore();
    });
    const restore = () => {
      if (restored) return;
      restored = true;
      if (state.responseLibrary === lockedLibrary) state.responseLibrary = originalLibrary;
      observer.disconnect();
    };
    observer.observe(elements.result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.setTimeout(restore, 4200);
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
      await loadPernikPack();
      await waitForStableLibrary(900);
      const severity = await computeVisualSeverity(state.currentImageData).catch((error) => {
        console.warn('Vizuální damage skóre selhalo, používám deterministický fallback:', error);
        return 36 + (hashText(String(state.currentImageData).slice(-220)) % 48);
      });
      const selected = selectVerdict(severity);
      const originalLibrary = state.responseLibrary;
      const lockedLibrary = makeSeverityLockedLibrary(selected, severity);
      state.visualDamageSeverity = severity;
      state.visualDamageTier = tierForSeverity(severity);
      state.responseLibrary = lockedLibrary;
      restoreLibraryWhenReady(originalLibrary, lockedLibrary);
      app.setBusy(false);
      originalRunAnalysis(options);
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
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
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
      await runTieredAnalysis();
    } catch (error) {
      console.error('Perníkovej upload se nepovedl:', error);
      app.showError('Fotka se nepovedla načíst. Zkus jinou, tahle odmítla vypovídat.');
    } finally {
      event.target.value = '';
      if (!state.isAnalyzing) {
        elements.uploadButton.disabled = false;
        elements.analyzeButton.disabled = false;
      }
    }
  }

  function replaceExactText(element, replacements) {
    if (!element) return;
    const replacement = replacements[element.textContent.trim()];
    if (replacement && replacement !== element.textContent) element.textContent = replacement;
  }

  function polishMicrocopy() {
    microcopyQueued = false;
    replaceExactText(elements.scanHint, {
      'VOID engine pitvá obraz a hledá zbytky člověka…': 'Pitevní algoritmus počítá tiky a zbytky lidskosti…',
      'Podsvětí tiskne rozsudek přímo do ksichtu…': 'Perníkovej tribunál tiskne rozsudek přímo do ksichtu…',
      'Rozsudek je venku. Sdílej ostudu, nebo přiveď další subjekt.': 'Rozsudek venku. Sdílej důkazní materiál, nebo přiveď další trosku.'
    });

    replaceExactText(document.querySelector('.scan-state-copy'), {
      'Zamykám subjekt': 'Zamykám obličejovej důkaz',
      'Oči nalezeny • soudnost ne': 'Zorničky nalezeny • člověk ne',
      'Nos a ústa pod dohledem': 'Čelist a nos na výslechu',
      'Kontura trosek hotová': 'Perníkovej profil uzamčen',
      'Vážím zbytky důstojnosti': 'Počítám tiky a cizí zapalovače',
      'Rozpad potvrzen': 'Biologická reklamace potvrzena'
    });

    const revealTitle = document.querySelector('.result-reveal-title');
    if (revealTitle && state.visualDamageTier) {
      revealTitle.textContent = {
        low: 'Podezřele funkční',
        worn: 'Čelist na přesčase',
        junky: 'Perníkovej rozpad potvrzen',
        critical: 'Člověk nenalezen'
      }[state.visualDamageTier];
    }

    const detailsLabel = elements.result.querySelector('.in-frame-details-label');
    if (detailsLabel) {
      detailsLabel.textContent = elements.result.classList.contains('details-open')
        ? 'Skrýt pitevní zprávu'
        : 'Otevřít pitevní zprávu';
    }

    const diagnosticHeading = elements.result.querySelector('.diagnostic-heading');
    if (diagnosticHeading) {
      const strong = diagnosticHeading.querySelector('strong');
      const small = diagnosticHeading.querySelector('small');
      if (strong) strong.textContent = 'PITEVNÍ AI ROZBOR';
      if (small) small.textContent = '100% nevědecký · 0% diagnóza';
    }

    const labelMap = {
      'Stabilita zorniček': 'Zorničky pod dohledem',
      'Kontakt s realitou': 'Signál z planety Země',
      'Koordinace pohybu': 'Schopnost dojít bez svědků',
      'Pravděpodobnost příchodu domů': 'Šance poznat vlastní adresu',
      'Riziko ztráty klíčů': 'Klíče už mají nového majitele',
      'Zbytková důstojnost': 'Zbytková lidskost',
      'Mozkový ping': 'Odezva posledního neuronu'
    };
    elements.result.querySelectorAll('.diagnostic-copy span').forEach((label) => replaceExactText(label, labelMap));

    elements.result.querySelectorAll('.result-tool-button span').forEach((label) => {
      if (label.textContent.trim() === 'Jiná deformace') label.textContent = 'Další porucha';
      if (label.textContent.trim() === 'Ještě víc mě znič') label.textContent = 'Dorazit zbytky';
    });

    if (!elements.result.classList.contains('hidden')) {
      elements.result.dataset.verdictTier = state.visualDamageTier || 'worn';
      elements.result.dataset.visualDamage = String(state.visualDamageSeverity || '');
    }
  }

  function queueMicrocopyPolish() {
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

  resultObserver = new MutationObserver(queueMicrocopyPolish);
  resultObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  loadPernikPack();
  queueMicrocopyPolish();

  window.addEventListener('pagehide', () => resultObserver?.disconnect(), { once: true });
})();
