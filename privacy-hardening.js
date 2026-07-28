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
      state.effectImageData = null;
      state.effectSeverity = 0;
      state.effectProfile = null;
      state.effectSeed = 0;
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

      const dataUrl = kind === 'original' ? state.currentImageData : state.effectImageData;
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

  const hiddenResultObserver = new MutationObserver(() => {
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
