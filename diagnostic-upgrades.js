(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) return;

  const { state, elements } = app;
  const STORAGE = {
    privacy: 'smazka:auto-clear-photo',
    sound: 'smazka:sound-enabled'
  };

  let audioContext = null;
  let lastResultToken = '';
  let resultWasVisible = false;
  let updateRegistration = null;
  let reloadForUpdate = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isHidden = (element) => !element || element.classList.contains('hidden');

  function readSetting(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : stored === 'true';
    } catch {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, String(Boolean(value)));
    } catch {
      // Private browsing can reject storage. The current session still works.
    }
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seeded(seed, offset = 0) {
    const value = Math.sin((seed + offset * 101.37) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function resultToken() {
    const title = state.lastAnalysisResult?.title || '';
    const severity = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50);
    const imageTail = String(state.currentImageData || '').slice(-36);
    return `${title}|${severity}|${imageTail}`;
  }

  function createDiagnostics(token, severity) {
    const seed = hashText(token);
    const jitter = (offset, amplitude) => Math.round((seeded(seed, offset) - 0.5) * amplitude * 2);
    const pupils = clamp(Math.round(92 - severity * 0.86 + jitter(1, 10)), 2, 96);
    const home = clamp(Math.round(96 - severity * 0.94 + jitter(2, 12)), 1, 98);
    const coordination = clamp(Math.round(94 - severity * 0.91 + jitter(3, 11)), 1, 97);
    const keys = clamp(Math.round(8 + severity * 0.9 + jitter(4, 10)), 3, 99);
    const ping = clamp(Math.round(75 + severity * 9.7 + seeded(seed, 5) * 210), 90, 1240);

    const reality = severity < 28
      ? 'podezřele stabilní'
      : severity < 50
        ? 'lehce mimo osu'
        : severity < 72
          ? 'nestabilní'
          : severity < 88
            ? 'kritický'
            : 'spojení přerušeno';

    const dignity = severity < 32
      ? 'ještě dohledatelná'
      : severity < 58
        ? 'na posledních 12 %'
        : severity < 80
          ? 'v nedohlednu'
          : 'nenalezena';

    return [
      { label: 'Stabilita zorniček', value: `${pupils} %`, score: pupils },
      { label: 'Kontakt s realitou', value: reality, score: clamp(100 - severity, 3, 96) },
      { label: 'Koordinace pohybu', value: `${coordination} %`, score: coordination },
      { label: 'Pravděpodobnost příchodu domů', value: `${home} %`, score: home },
      { label: 'Riziko ztráty klíčů', value: `${keys} %`, score: keys, danger: true },
      { label: 'Zbytková důstojnost', value: dignity, score: clamp(100 - severity * 1.08, 0, 94) },
      { label: 'Mozkový ping', value: `${ping} ms${severity >= 74 ? '+' : ''}`, score: clamp(100 - ping / 13, 4, 82), danger: true }
    ];
  }

  function getAudioContext() {
    if (!readSetting(STORAGE.sound, true)) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => undefined);
    return audioContext;
  }

  function tone(frequency, startDelay, duration, volume = 0.035, type = 'sine') {
    const context = getAudioContext();
    if (!context) return;

    const startsAt = context.currentTime + startDelay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  function playScanStart() {
    tone(210, 0, 0.08, 0.025, 'triangle');
    tone(310, 0.1, 0.07, 0.028, 'triangle');
    tone(460, 0.21, 0.09, 0.03, 'sine');
  }

  function playResultReveal(severity = 50) {
    tone(430, 0, 0.08, 0.028, 'sine');
    tone(620, 0.09, 0.09, 0.032, 'triangle');
    tone(severity >= 75 ? 118 : 820, 0.2, severity >= 75 ? 0.16 : 0.12, 0.035, severity >= 75 ? 'sawtooth' : 'sine');
  }

  function playReroll() {
    tone(540, 0, 0.07, 0.027, 'square');
    tone(380, 0.08, 0.07, 0.024, 'square');
    tone(690, 0.17, 0.1, 0.03, 'triangle');
  }

  function vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Vibrate API is intentionally optional, especially on iOS.
    }
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return false;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  function extensionFor(dataUrl) {
    if (String(dataUrl).startsWith('data:image/png')) return 'png';
    if (String(dataUrl).startsWith('data:image/webp')) return 'webp';
    return 'jpg';
  }

  async function saveOriginal(button) {
    const source = state.currentImageData;
    if (!source) return app.showError('Původní fotka už byla bezpečně smazána.');
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Ukládám…';
    downloadDataUrl(source, `smazka-original-${Date.now()}.${extensionFor(source)}`);
    vibrate(20);
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = previous;
    }, 450);
  }

  async function saveDeformed(button) {
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Připravuju…';

    try {
      await Promise.resolve(state.shareImagePromise).catch(() => undefined);
      const source = state.effectImageData;
      if (!source) throw new Error('Deformovaný obrázek zatím není připravený');
      downloadDataUrl(source, `smazka-deformace-${Date.now()}.png`);
      vibrate([18, 35, 24]);
      button.textContent = 'Uloženo ✓';
    } catch (error) {
      console.warn('Uložení deformace selhalo:', error);
      app.showError('Deformovaný obrázek se nepovedlo uložit. Zkus to ještě jednou.');
      button.textContent = 'Zkusit znovu';
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = previous;
      }, 900);
    }
  }

  function waitFor(predicate, timeout = 900) {
    const started = performance.now();
    return new Promise((resolve) => {
      const inspect = () => {
        if (predicate()) return resolve(true);
        if (performance.now() - started >= timeout) return resolve(false);
        requestAnimationFrame(inspect);
      };
      inspect();
    });
  }

  async function refreshWarp(previousKey, previousSeed, attempt = 0) {
    elements.result.removeAttribute('data-warp-token');
    elements.result.classList.toggle('diagnostic-warp-refresh');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    elements.result.classList.toggle('diagnostic-warp-refresh');

    await waitFor(() => state.effectSeed && state.effectSeed !== previousSeed, 1100);
    const currentKey = state.effectProfile?.key || '';
    if (currentKey && currentKey === previousKey && attempt < 3) {
      return refreshWarp(currentKey, state.effectSeed, attempt + 1);
    }

    await Promise.resolve(state.shareImagePromise).catch(() => undefined);
    return true;
  }

  async function rerollDeformation(button) {
    if (!state.currentImageData) return app.showError('Fotka už není dostupná. Spusť nový sken.');

    const previousText = button.textContent;
    const previousKey = state.effectProfile?.key || '';
    const previousSeed = state.effectSeed;
    button.disabled = true;
    button.textContent = 'Přepočítávám…';
    playReroll();
    vibrate([14, 28, 14]);

    try {
      await refreshWarp(previousKey, previousSeed);
      button.textContent = 'Jiná deformace ✓';
    } catch (error) {
      console.warn('Přegenerování deformace selhalo:', error);
      app.showError('Jiná deformace se teď nepovedla. Zkus to znovu.');
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = previousText;
      }, 650);
    }
  }

  function buildDiagnostics(diagnostics) {
    const section = document.createElement('section');
    section.className = 'diagnostic-panel';
    section.setAttribute('aria-label', 'Falešný detailní AI rozbor');

    const heading = document.createElement('div');
    heading.className = 'diagnostic-heading';
    heading.innerHTML = '<span class="diagnostic-pulse" aria-hidden="true"></span><div><strong>AI DETAILNÍ ROZBOR</strong><small>výsledky jsou samozřejmě absolutně nevědecké</small></div>';

    const list = document.createElement('div');
    list.className = 'diagnostic-list';

    diagnostics.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `diagnostic-row${item.danger ? ' is-danger' : ''}`;
      row.style.setProperty('--diagnostic-delay', `${index * 75}ms`);

      const copy = document.createElement('div');
      copy.className = 'diagnostic-copy';
      const label = document.createElement('span');
      label.textContent = item.label;
      const value = document.createElement('strong');
      value.textContent = item.value;
      copy.append(label, value);

      const meter = document.createElement('span');
      meter.className = 'diagnostic-meter';
      meter.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('i');
      fill.style.setProperty('--diagnostic-score', `${clamp(item.score, 2, 100)}%`);
      meter.appendChild(fill);

      row.append(copy, meter);
      list.appendChild(row);
    });

    section.append(heading, list);
    return section;
  }

  function buildToolButtons() {
    const grid = document.createElement('div');
    grid.className = 'result-tool-grid';

    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'result-tool-button result-tool-primary';
    reroll.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-switch"></use></svg><span>Jiná deformace</span>';
    reroll.addEventListener('click', () => rerollDeformation(reroll));

    const saveOriginalButton = document.createElement('button');
    saveOriginalButton.type = 'button';
    saveOriginalButton.className = 'result-tool-button';
    saveOriginalButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-photo"></use></svg><span>Uložit originál</span>';
    saveOriginalButton.addEventListener('click', () => saveOriginal(saveOriginalButton));

    const saveWarpButton = document.createElement('button');
    saveWarpButton.type = 'button';
    saveWarpButton.className = 'result-tool-button';
    saveWarpButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-download"></use></svg><span>Uložit deformaci</span>';
    saveWarpButton.addEventListener('click', () => saveDeformed(saveWarpButton));

    grid.append(reroll, saveOriginalButton, saveWarpButton);
    return grid;
  }

  function decorateResult() {
    if (isHidden(elements.result) || !state.currentImageData) return;
    const content = elements.result.querySelector('.result-content');
    const description = content?.querySelector('.description');
    const actions = content?.querySelector('.result-actions');
    if (!content || !description || !actions) return;

    const token = resultToken();
    if (elements.result.dataset.diagnosticToken === token) return;
    elements.result.dataset.diagnosticToken = token;

    const severity = clamp(Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50), 12, 98);
    const diagnostics = createDiagnostics(token, severity);
    state.diagnosticData = diagnostics;

    content.querySelector('.diagnostic-panel')?.remove();
    content.querySelector('.result-tool-grid')?.remove();
    description.insertAdjacentElement('afterend', buildDiagnostics(diagnostics));
    actions.insertAdjacentElement('beforebegin', buildToolButtons());

    if (token !== lastResultToken) {
      lastResultToken = token;
      playResultReveal(severity);
      vibrate(severity >= 75 ? [24, 45, 34, 60, 42] : [18, 45, 26]);
    }
  }

  function installSettings() {
    const footer = document.querySelector('footer');
    if (!footer || document.getElementById('privacyModeToggle')) return;

    const panel = document.createElement('section');
    panel.className = 'local-settings';
    panel.setAttribute('aria-label', 'Nastavení soukromí a zvuku');

    const privacyLabel = document.createElement('label');
    privacyLabel.className = 'setting-row';
    privacyLabel.innerHTML = '<span><strong>Bezpečný režim</strong><small>Po zavření výsledku odstraní fotku z paměti.</small></span>';
    const privacyToggle = document.createElement('input');
    privacyToggle.id = 'privacyModeToggle';
    privacyToggle.type = 'checkbox';
    privacyToggle.checked = readSetting(STORAGE.privacy, true);
    privacyToggle.addEventListener('change', () => writeSetting(STORAGE.privacy, privacyToggle.checked));
    privacyLabel.appendChild(privacyToggle);

    const soundLabel = document.createElement('label');
    soundLabel.className = 'setting-row';
    soundLabel.innerHTML = '<span><strong>Zvuky skeneru</strong><small>Krátká lokální pípnutí, žádné audio soubory.</small></span>';
    const soundToggle = document.createElement('input');
    soundToggle.id = 'soundModeToggle';
    soundToggle.type = 'checkbox';
    soundToggle.checked = readSetting(STORAGE.sound, true);
    soundToggle.addEventListener('change', () => {
      writeSetting(STORAGE.sound, soundToggle.checked);
      if (soundToggle.checked) tone(620, 0, 0.08, 0.025, 'sine');
    });
    soundLabel.appendChild(soundToggle);

    panel.append(privacyLabel, soundLabel);
    footer.prepend(panel);
  }

  function clearPrivatePhoto() {
    if (!readSetting(STORAGE.privacy, true) || !state.currentImageData) return;
    app.clearCurrentImage();
    state.diagnosticData = null;
    elements.result.removeAttribute('data-diagnostic-token');
    elements.result.removeAttribute('data-warp-token');
    elements.retakeButton?.classList.add('hidden');
    elements.analyzeButton?.classList.remove('hidden');
    app.setHint('Bezpečný režim fotku odstranil. Pro další výsledek spusť nový sken.');
  }

  function showUpdateBanner(registration) {
    if (document.getElementById('appUpdateBanner')) return;
    updateRegistration = registration;

    const banner = document.createElement('aside');
    banner.id = 'appUpdateBanner';
    banner.className = 'app-update-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<div><strong>✨ Nová verze je připravená</strong><span>Aktualizace proběhne bez ztráty nastavení.</span></div>';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Aktualizovat';
    button.addEventListener('click', () => {
      const worker = updateRegistration?.waiting;
      if (!worker) return;
      reloadForUpdate = true;
      button.disabled = true;
      button.textContent = 'Aktualizuji…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    });

    banner.appendChild(button);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));
  }

  async function watchServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadForUpdate) return;
        reloadForUpdate = false;
        location.reload();
      });

      registration.update().catch(() => undefined);
    } catch (error) {
      console.warn('Kontrola aktualizace není dostupná:', error);
    }
  }

  elements.analyzeButton?.addEventListener('pointerdown', () => {
    getAudioContext();
    playScanStart();
    vibrate([16, 50, 18, 105, 24]);
  }, { capture: true });

  elements.uploadButton?.addEventListener('pointerdown', () => {
    getAudioContext();
    tone(280, 0, 0.07, 0.022, 'triangle');
    vibrate(16);
  }, { capture: true });

  elements.uploadInput?.addEventListener('change', () => {
    playScanStart();
    vibrate([16, 55, 22]);
  });

  const resultObserver = new MutationObserver(() => {
    const visible = !isHidden(elements.result);
    if (visible) decorateResult();
    if (resultWasVisible && !visible) window.setTimeout(clearPrivatePhoto, 0);
    resultWasVisible = visible;
  });

  resultObserver.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  installSettings();
  watchServiceWorkerUpdates();
  decorateResult();

  window.SmazkaDiagnostics = {
    rerollDeformation,
    clearPrivatePhoto,
    createDiagnostics
  };

  window.addEventListener('pagehide', () => resultObserver.disconnect(), { once: true });
})();
