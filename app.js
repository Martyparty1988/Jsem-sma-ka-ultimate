(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const elements = {
    video: $('video'),
    canvas: $('canvas'),
    captureButton: $('captureButton'),
    retakeButton: $('retakeButton'),
    analyzeButton: $('analyzeButton'),
    result: $('result'),
    loading: $('loading'),
    previewContainer: $('previewContainer'),
    preview: $('preview'),
    cameraError: $('cameraError'),
    uploadButton: $('uploadButton'),
    uploadInput: $('uploadInput'),
    generalError: $('generalError'),
    scanHint: $('scanHint')
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
    cameraStream: null,
    lastAnalysisResult: { title: '', description: '' },
    responseLibrary: [],
    isAnalyzing: false,
    lastCategory: ''
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

  function setBusy(isBusy) {
    state.isAnalyzing = isBusy;
    elements.analyzeButton.disabled = isBusy;
    elements.retakeButton.disabled = isBusy;
    elements.uploadButton.disabled = isBusy;
    elements.captureButton.disabled = isBusy;
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

  async function loadResponses() {
    try {
      const response = await fetch('responses.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
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

  async function initCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showError('Tenhle prohlížeč neumí otevřít kameru. Nahraj fotku ručně.', elements.cameraError);
      show(elements.uploadButton);
      return;
    }

    stopCamera();

    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      elements.video.srcObject = state.cameraStream;
      await elements.video.play().catch(() => undefined);
      elements.video.style.display = 'block';
      clearErrors();
      hide(elements.uploadButton);
      setHint('Kamera běží. Dej obličej do středu a spusť sken.');
    } catch (error) {
      console.error('Kamera nejde spustit:', error);
      showError('Kamera nechce spolupracovat. Povol oprávnění, nebo nahraj fotku ručně.', elements.cameraError);
      show(elements.uploadButton);
      setHint('Bez kamery můžeš použít nahrání fotky.');
    }
  }

  function stopCamera() {
    if (!state.cameraStream) return;
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }

  function setCurrentImageData(dataUrl) {
    state.currentImageData = dataUrl;
    if (dataUrl && elements.preview) {
      elements.preview.src = dataUrl;
      show(elements.previewContainer);
    }
  }

  function captureCurrentFrame(quality = 0.92) {
    if (!elements.video.videoWidth || !elements.video.videoHeight) return null;

    const context = elements.canvas.getContext('2d');
    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    context.drawImage(elements.video, 0, 0, elements.canvas.width, elements.canvas.height);

    const dataUrl = elements.canvas.toDataURL('image/jpeg', quality);
    setCurrentImageData(dataUrl);
    return dataUrl;
  }

  function getRandomResult() {
    const library = state.responseLibrary.length ? state.responseLibrary : fallbackResponses;
    if (library.length === 1) return library[0];

    let result = library[Math.floor(Math.random() * library.length)];
    let guard = 0;
    while (result.category === state.lastCategory && guard < 5) {
      result = library[Math.floor(Math.random() * library.length)];
      guard += 1;
    }
    state.lastCategory = result.category;
    return result;
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

  function displayResult(result) {
    const category = syncWeekdayText(result.category || 'Neznámý stav');
    const description = syncWeekdayText(result.description || 'AI se tváří tajemně a odmítá vypovídat.');
    const emoji = iconForCategory(category);
    const todayLabel = capitalizeFirst(getTodayForms().nominative);

    state.lastAnalysisResult = { title: category, description };
    elements.result.replaceChildren();

    const badge = document.createElement('div');
    badge.className = 'result-badge';
    badge.textContent = `Výsledek skenu • ${todayLabel}`;

    const title = document.createElement('h2');
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

    elements.result.append(badge, title, text, shareButton);
    show(elements.result);
    prepareShareImage(category, description);
    triggerConfetti();
  }

  function runAnalysis(options = {}) {
    if (state.isAnalyzing) return;

    if (!state.currentImageData && !options.skipImageCheck) {
      showError('Nejdřív spusť sken, vyfoť obličej nebo nahraj fotku. Bez materiálu AI jen dramaticky kouká do zdi.');
      return;
    }

    clearErrors();
    hide(elements.result);
    show(elements.loading);
    setBusy(true);
    setHint('AI simuluje brutálně seriózní analýzu…');

    const delay = 950 + Math.round(Math.random() * 650);
    window.setTimeout(() => {
      displayResult(getRandomResult());
      hide(elements.loading);
      setBusy(false);
      setHint('Hotovo. Můžeš dát další sken nebo rovnou sdílet výsledek.');
    }, delay);
  }

  function triggerConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof window.confetti !== 'function') return;

    window.confetti({ particleCount: 70, spread: 65, origin: { x: 0.25, y: 0.65 } });
    window.confetti({ particleCount: 70, spread: 65, origin: { x: 0.75, y: 0.65 } });
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

  function prepareShareImage(title, description) {
    const ctx = elements.canvas.getContext('2d');
    const image = new Image();
    const width = 1080;
    const imageHeight = 820;
    const panelHeight = 430;

    const drawBase = () => {
      elements.canvas.width = width;
      elements.canvas.height = imageHeight + panelHeight;

      const gradient = ctx.createLinearGradient(0, 0, width, elements.canvas.height);
      gradient.addColorStop(0, '#0b1220');
      gradient.addColorStop(0.55, '#111827');
      gradient.addColorStop(1, '#020617');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    };

    image.onload = () => {
      drawBase();
      drawCoverImage(ctx, image, 0, 0, width, imageHeight);
      drawResultPanel(ctx, title, description, imageHeight, width, panelHeight);
    };

    image.onerror = () => {
      drawBase();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
      ctx.fillRect(0, 0, width, imageHeight);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 64px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Jsem smažka?', width / 2, imageHeight / 2);
      drawResultPanel(ctx, title, description, imageHeight, width, panelHeight);
    };

    image.src = state.currentImageData || '';
  }

  function drawResultPanel(ctx, title, description, top, width, height) {
    const todayLabel = capitalizeFirst(getTodayForms().nominative).toLocaleUpperCase('cs-CZ');

    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.fillRect(0, top, width, height);

    ctx.fillStyle = '#67e8f9';
    ctx.font = '700 28px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`LOKÁLNÍ AI DETEKCE DEVASTACE • ${todayLabel}`, width / 2, top + 58);

    ctx.fillStyle = '#d1fae5';
    let titleSize = 66;
    ctx.font = `800 ${titleSize}px Segoe UI, sans-serif`;
    while (ctx.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      ctx.font = `800 ${titleSize}px Segoe UI, sans-serif`;
    }
    ctx.fillText(title, width / 2, top + 145);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'italic 38px Segoe UI, sans-serif';
    wrapText(ctx, description, width / 2, top + 220, width - 130, 48, 3);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.font = '28px Segoe UI, sans-serif';
    ctx.fillText('jsemsmazka.cz • jen pro srandu, ne diagnóza', width / 2, top + height - 52);
  }

  async function shareResult() {
    try {
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
    URL.revokeObjectURL(url);
  }

  function handleUploadedFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Nahraj prosím obrázek, třeba JPEG nebo PNG. PDF s obličejem ještě neumíme, nejsme FBI.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setCurrentImageData(event.target.result);
      elements.video.style.display = 'none';
      stopCamera();
      hide(elements.captureButton);
      hide(elements.uploadButton);
      show(elements.retakeButton);
      show(elements.analyzeButton);
      hide(elements.result);
      clearErrors();
      runAnalysis();
    };
    reader.onerror = () => showError('Fotka se nepovedla načíst. Zkus jinou.');
    reader.readAsDataURL(file);
  }

  elements.captureButton.addEventListener('click', () => {
    const dataUrl = captureCurrentFrame(0.9);
    if (!dataUrl) {
      showError('Kamera ještě neposlala obraz. Dej jí vteřinu a zkus to znovu.');
      return;
    }

    elements.video.style.display = 'none';
    stopCamera();
    hide(elements.captureButton);
    hide(elements.uploadButton);
    show(elements.retakeButton);
    show(elements.analyzeButton);
    hide(elements.result);
    clearErrors();
  });

  elements.uploadButton.addEventListener('click', () => elements.uploadInput.click());
  elements.uploadInput.addEventListener('change', (event) => {
    handleUploadedFile(event.target.files?.[0]);
    elements.uploadInput.value = '';
  });

  elements.retakeButton.addEventListener('click', async () => {
    window.SmazkaFaceScan?.reset?.();
    state.currentImageData = null;
    elements.preview.removeAttribute('src');
    hide(elements.previewContainer);
    hide(elements.retakeButton);
    hide(elements.result);
    show(elements.analyzeButton);
    clearErrors();
    await initCamera();
  });

  elements.analyzeButton.addEventListener('click', () => {
    if (window.SmazkaFaceScan?.start) {
      window.SmazkaFaceScan.start();
      return;
    }
    runAnalysis();
  });

  window.SmazkaApp = {
    elements,
    state,
    initCamera,
    stopCamera,
    captureCurrentFrame,
    setCurrentImageData,
    runAnalysis,
    showError,
    clearErrors,
    setHint,
    setBusy,
    syncWeekdayText,
    getTodayForms
  };

  window.addEventListener('beforeunload', stopCamera);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((error) => {
        console.warn('Service worker registrace selhala:', error);
      });
    });
  }

  loadResponses();
  initCamera();
})();
