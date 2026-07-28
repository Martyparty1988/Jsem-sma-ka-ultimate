(() => {
  'use strict';

  const BANNER_ID = 'appUpdateBanner';
  const UPDATE_PARAM = 'pwa-update';
  const RELOAD_FALLBACK_MS = 2200;
  let updateStarted = false;
  let navigationStarted = false;
  let fallbackTimer = 0;

  function removeUpdateMarker() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(UPDATE_PARAM)) return;
      url.searchParams.delete(UPDATE_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // The marker is cosmetic; a failed cleanup must never block the app.
    }
  }

  function forceReload() {
    if (navigationStarted) return;
    navigationStarted = true;
    window.clearTimeout(fallbackTimer);

    const url = new URL(window.location.href);
    url.searchParams.set(UPDATE_PARAM, Date.now().toString(36));
    window.location.replace(url.href);
  }

  function setButtonState(button, text, disabled = true) {
    if (!button) return;
    button.disabled = disabled;
    button.textContent = text;
    button.setAttribute('aria-busy', String(disabled));
  }

  function waitForWaitingWorker(registration, timeout = 5000) {
    if (registration.waiting) return Promise.resolve(registration.waiting);

    return new Promise((resolve) => {
      let settled = false;
      let candidate = registration.installing;

      const finish = (worker = null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        registration.removeEventListener('updatefound', inspect);
        candidate?.removeEventListener('statechange', inspect);
        resolve(worker);
      };

      const inspect = () => {
        if (registration.waiting) {
          finish(registration.waiting);
          return;
        }

        if (registration.installing && registration.installing !== candidate) {
          candidate?.removeEventListener('statechange', inspect);
          candidate = registration.installing;
          candidate.addEventListener('statechange', inspect);
        }

        if (candidate?.state === 'installed') {
          finish(registration.waiting || candidate);
        } else if (candidate?.state === 'redundant') {
          finish(null);
        }
      };

      const timer = window.setTimeout(() => finish(registration.waiting || null), timeout);
      registration.addEventListener('updatefound', inspect);
      candidate?.addEventListener('statechange', inspect);
      inspect();
    });
  }

  async function applyUpdate(button) {
    if (updateStarted || !('serviceWorker' in navigator)) return;
    updateStarted = true;
    setButtonState(button, 'Aktualizuji…');

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('Registrace service workeru nebyla nalezena');

      navigator.serviceWorker.addEventListener('controllerchange', forceReload, { once: true });
      await registration.update().catch(() => undefined);

      const worker = registration.waiting || await waitForWaitingWorker(registration);
      if (worker && worker.state !== 'redundant') {
        worker.postMessage({ type: 'SKIP_WAITING' });
        setButtonState(button, 'Restartuji aplikaci…');
        fallbackTimer = window.setTimeout(forceReload, RELOAD_FALLBACK_MS);
        return;
      }

      // iOS can activate the worker before the tap reaches the button. In that
      // case there is no waiting worker left, but a hard navigation loads the
      // already active version.
      setButtonState(button, 'Načítám novou verzi…');
      forceReload();
    } catch (error) {
      console.warn('Aktualizace aplikace selhala:', error);
      updateStarted = false;
      setButtonState(button, 'Zkusit aktualizaci znovu', false);
    }
  }

  function ensureBanner() {
    let banner = document.getElementById(BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'app-update-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<div><strong>Nová verze je připravená</strong><span>Aktualizace proběhne bez ztráty nastavení.</span></div><button type="button">Aktualizovat</button>';
    document.body.appendChild(banner);
    window.requestAnimationFrame(() => banner.classList.add('is-visible'));
    return banner;
  }

  async function watchUpdates() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting && navigator.serviceWorker.controller) ensureBanner();

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            ensureBanner();
          }
        });
      });
    } catch (error) {
      console.warn('Sledování PWA aktualizací není dostupné:', error);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.(`#${BANNER_ID} button`);
    if (!button) return;

    // Capture phase intentionally replaces the older click handler, which can
    // silently return when iOS has already moved the worker out of `waiting`.
    event.preventDefault();
    event.stopImmediatePropagation();
    void applyUpdate(button);
  }, true);

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (updateStarted) forceReload();
  });

  removeUpdateMarker();
  void watchUpdates();
})();