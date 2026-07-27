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

  function removeLegacyConfetti(root = document) {
    root.querySelectorAll?.('.confetti-layer, .confetti-piece').forEach((node) => node.remove());
    if (root instanceof Element && root.matches('.confetti-layer, .confetti-piece')) root.remove();
  }

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

    removeLegacyConfetti();

    const badge = result.querySelector('.result-badge');
    if (badge) badge.textContent = 'VOID VERDIKT';

    const shareLabel = result.querySelector('#shareResultButton span:last-child');
    if (shareLabel) shareLabel.textContent = 'Sdílet rozsudek';

    const visual = result.querySelector('.result-visual');
    const effectLabel = visual?.querySelector('.effect-label');
    if (visual && effectLabel) {
      effectLabel.classList.add('result-score');
      const effectName = effectLabel.querySelector('span');
      let meta = result.querySelector('.result-effect-meta');
      if (!meta && effectName) {
        meta = document.createElement('p');
        meta.className = 'result-effect-meta';
        meta.innerHTML = `<span>Efekt</span><strong>${effectName.textContent.trim()}</strong>`;
        visual.insertAdjacentElement('afterend', meta);
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

  const resultObserver = result && new MutationObserver(() => {
    window.requestAnimationFrame(decorateResult);
  });
  resultObserver?.observe(result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const copyObserver = new MutationObserver(() => {
    cleanStatusCopy();
    cleanHintCopy();
  });
  if (scanStatus) copyObserver.observe(scanStatus, { childList: true, subtree: true, characterData: true });
  if (scanHint) copyObserver.observe(scanHint, { childList: true, subtree: true, characterData: true });

  const legacyEffectsObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) removeLegacyConfetti(node);
      });
    });
  });
  legacyEffectsObserver.observe(document.body, { childList: true, subtree: true });

  const previewObserver = preview && new MutationObserver(() => {
    if (suppressPreviewObservation) return;
    const currentSrc = preview.getAttribute('src') || '';
    if (!cameraStage?.classList.contains('is-revealing-result')) {
      lastStablePreviewSrc = currentSrc;
    } else if (!revealTargetSrc && currentSrc !== lastStablePreviewSrc) {
      revealTargetSrc = currentSrc;
    }
  });
  previewObserver?.observe(preview, { attributes: true, attributeFilter: ['src'] });

  const revealObserver = cameraStage && new MutationObserver(() => {
    const isRevealing = cameraStage.classList.contains('is-revealing-result');
    if (isRevealing && !wasRevealing) startCinematicReveal();
    if (!isRevealing && wasRevealing) clearRevealPhases();
    wasRevealing = isRevealing;
  });
  revealObserver?.observe(cameraStage, { attributes: true, attributeFilter: ['class'] });

  removeLegacyConfetti();
  cleanStatusCopy();
  cleanHintCopy();
  decorateResult();

  window.addEventListener('pagehide', () => {
    clearRevealPhases();
    resultObserver?.disconnect();
    copyObserver.disconnect();
    legacyEffectsObserver.disconnect();
    previewObserver?.disconnect();
    revealObserver?.disconnect();
  }, { once: true });
})();
