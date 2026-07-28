const ACTIVE_READOUTS = new WeakMap();
const TYPE_DELAY = 80;
const COUNTER_DURATION = 600;

const FALLBACK_FLAVOR = Object.freeze({
  apertura: 'APERTURA: {value}% // MĚŘENO',
  gravitace: 'GRAVITACE: {value}° // KŘIVÁ',
  asymetrie: 'ASYMETRIE: {value} // DETEKOVÁNA',
  hydratace: 'H₂O: -{value}% // SUCHO',
  lidskost: 'LIDSKOST: {value}% // ORIENTAČNÍ'
});

const METRIC_ROWS = Object.freeze([
  ['apertura', 0],
  ['gravitace', 1],
  ['asymetrie', null],
  ['hydratace', 0],
  ['lidskost', 0]
]);

function finiteNumber(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : minimum;
}

function metricValue(metrics, key) {
  if (key === 'gravitace') return finiteNumber(metrics?.[key], 0, 45);
  if (key === 'asymetrie') {
    const value = String(metrics?.[key] || 'neznámá').trim().toLocaleLowerCase('cs-CZ');
    return ['nízká', 'střední', 'vysoká'].includes(value) ? value : 'neznámá';
  }
  return finiteNumber(metrics?.[key], 0, 100);
}

function createRunState() {
  const wakeups = new Set();
  const cleanupCallbacks = new Set();
  let skipped = false;
  let cancelled = false;

  const wake = () => {
    [...wakeups].forEach((resolve) => resolve());
    wakeups.clear();
  };

  return {
    get skipped() {
      return skipped;
    },
    get cancelled() {
      return cancelled;
    },
    wait(milliseconds) {
      if (skipped || cancelled || milliseconds <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          wakeups.delete(finish);
          resolve();
        };
        const timer = setTimeout(finish, milliseconds);
        wakeups.add(finish);
      });
    },
    onCleanup(callback) {
      cleanupCallbacks.add(callback);
    },
    skip() {
      skipped = true;
      wake();
    },
    cancel() {
      cancelled = true;
      wake();
      [...cleanupCallbacks].forEach((callback) => callback());
      cleanupCallbacks.clear();
    },
    cleanup() {
      [...cleanupCallbacks].forEach((callback) => callback());
      cleanupCallbacks.clear();
    }
  };
}

async function typeText(element, value, run) {
  const text = String(value);
  const characters = Array.from(text);

  for (let index = 0; index < characters.length; index += 1) {
    if (run.cancelled) return;
    if (run.skipped) {
      element.textContent = text;
      return;
    }
    element.textContent += characters[index];
    await run.wait(TYPE_DELAY);
  }
}

async function animateCounter(element, target, precision, run, onFrame) {
  const format = (value) => Number(value).toFixed(precision);
  const startedAt = performance.now();

  element.textContent = format(0);
  onFrame?.(0);

  while (!run.skipped && !run.cancelled) {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, elapsed / COUNTER_DURATION);
    const eased = 1 - ((1 - progress) ** 3);
    const current = target * eased;
    element.textContent = format(current);
    onFrame?.(current);
    if (progress >= 1) return;
    await run.wait(16);
  }

  if (!run.cancelled) {
    element.textContent = format(target);
    onFrame?.(target);
  }
}

function appendTextSpan(documentRef, parent, className) {
  const span = documentRef.createElement('span');
  span.className = className;
  parent.appendChild(span);
  return span;
}

function buildMetricRow(documentRef, key) {
  const row = documentRef.createElement('p');
  row.className = 'terminal-readout__line';
  row.dataset.metric = key;

  const prompt = appendTextSpan(documentRef, row, 'terminal-readout__prompt');
  const before = appendTextSpan(documentRef, row, 'terminal-readout__copy');
  const value = appendTextSpan(documentRef, row, 'terminal-readout__value');
  const after = appendTextSpan(documentRef, row, 'terminal-readout__copy');

  return { row, prompt, before, value, after };
}

async function animateMetricRow(nodes, template, value, precision, run) {
  const marker = '{value}';
  const markerIndex = template.indexOf(marker);

  await typeText(nodes.prompt, '► ', run);
  if (markerIndex < 0) {
    await typeText(nodes.before, template, run);
    return;
  }

  await typeText(nodes.before, template.slice(0, markerIndex), run);
  if (precision === null) {
    await typeText(nodes.value, value, run);
  } else {
    await animateCounter(nodes.value, value, precision, run);
  }
  await typeText(nodes.after, template.slice(markerIndex + marker.length), run);
}

function updateProgressMeter(meter, value) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 10);
  meter.textContent = `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
}

function createFallbackVerdict(documentRef, verdict) {
  const content = documentRef.createElement('article');
  content.className = 'terminal-verdict';
  content.dataset.terminalVerdict = '';
  content.hidden = true;

  const title = documentRef.createElement('h2');
  title.textContent = verdict?.category || 'Verdikt nenalezen';
  const description = documentRef.createElement('p');
  description.textContent = verdict?.description || 'Terminál odmítl vypovídat.';
  content.append(title, description);

  return content;
}

function ensureStylesheet(documentRef) {
  if (documentRef.querySelector('link[data-terminal-readout-styles]')) return;

  const link = documentRef.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./terminal-readout.css', import.meta.url).href;
  link.dataset.terminalReadoutStyles = '';
  documentRef.head?.appendChild(link);
}

function installSkipListeners(documentRef, run) {
  const skip = () => run.skip();
  const skipWithKeyboard = (event) => {
    if (event.key === 'Escape') return;
    skip();
  };
  let installed = false;

  const timer = setTimeout(() => {
    if (run.cancelled) return;
    installed = true;
    documentRef.addEventListener('pointerdown', skip, { capture: true, passive: true });
    documentRef.addEventListener('keydown', skipWithKeyboard, { capture: true });
  }, 0);

  run.onCleanup(() => {
    clearTimeout(timer);
    if (!installed) return;
    documentRef.removeEventListener('pointerdown', skip, { capture: true });
    documentRef.removeEventListener('keydown', skipWithKeyboard, { capture: true });
  });
}

function dispatchComplete(targetElement, metrics, verdict, skipped) {
  const CustomEventConstructor = targetElement.ownerDocument?.defaultView?.CustomEvent;
  if (typeof CustomEventConstructor !== 'function') return;

  targetElement.dispatchEvent(new CustomEventConstructor('terminal-readout:complete', {
    bubbles: true,
    detail: { metrics, verdict, skipped }
  }));
}

/**
 * Vypíše lokální satirické biometrické metriky a následně odhalí verdikt.
 * Vrací Promise<{ skipped, cancelled }>. Tap nebo klávesa dokončí výpis ihned.
 */
export async function animateTerminalReadout(metrics, verdict, targetElement) {
  if (!targetElement || typeof targetElement.prepend !== 'function') {
    throw new TypeError('targetElement musí být platný DOM element.');
  }

  ACTIVE_READOUTS.get(targetElement)?.cancel();

  const run = createRunState();
  ACTIVE_READOUTS.set(targetElement, run);
  const documentRef = targetElement.ownerDocument;
  const reducedMotion = documentRef.defaultView
    ?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  ensureStylesheet(documentRef);
  targetElement.querySelector(':scope > .terminal-readout')?.remove();

  let verdictContent = targetElement.querySelector(
    ':scope > .result-content, :scope > [data-terminal-verdict]'
  );
  if (!verdictContent) {
    verdictContent = createFallbackVerdict(documentRef, verdict);
    targetElement.appendChild(verdictContent);
  } else if (verdictContent.matches('.terminal-verdict')) {
    verdictContent.querySelector('h2').textContent = verdict?.category || 'Verdikt nenalezen';
    verdictContent.querySelector('p').textContent = verdict?.description || 'Terminál odmítl vypovídat.';
  }

  const readout = documentRef.createElement('section');
  readout.className = 'terminal-readout';
  readout.setAttribute('aria-label', 'Biometrický výpis; satirické hodnoty, ne diagnóza');

  const title = documentRef.createElement('p');
  title.className = 'terminal-readout__title';

  const progressRow = documentRef.createElement('p');
  progressRow.className = 'terminal-readout__line terminal-readout__progress';
  const progressPrompt = appendTextSpan(documentRef, progressRow, 'terminal-readout__prompt');
  const progressLabel = appendTextSpan(documentRef, progressRow, 'terminal-readout__copy');
  const progressMeter = appendTextSpan(documentRef, progressRow, 'terminal-readout__meter');
  const progressValue = appendTextSpan(documentRef, progressRow, 'terminal-readout__value');
  progressValue.textContent = '0%';
  updateProgressMeter(progressMeter, 0);

  const rows = METRIC_ROWS.map(([key]) => buildMetricRow(documentRef, key));
  const divider = documentRef.createElement('p');
  divider.className = 'terminal-readout__divider';
  const found = documentRef.createElement('p');
  found.className = 'terminal-readout__found';

  const skipHint = documentRef.createElement('p');
  skipHint.className = 'terminal-readout__skip';
  skipHint.textContent = 'MEME, NE DIAGNÓZA · TAP = SKIP';

  readout.append(title, progressRow, ...rows.map(({ row }) => row), divider, found, skipHint);
  targetElement.prepend(readout);
  targetElement.classList.remove('terminal-readout-complete');
  targetElement.classList.add('terminal-readout-host', 'is-terminal-reading');
  installSkipListeners(documentRef, run);

  run.onCleanup(() => {
    readout.remove();
    targetElement.classList.remove('is-terminal-reading');
  });

  if (reducedMotion) run.skip();

  try {
    await typeText(title, '══════ BIOMETRICKÝ SKEN ══════', run);
    await typeText(progressPrompt, '► ', run);
    await typeText(progressLabel, 'SKENOVÁNÍ... ', run);
    await animateCounter(progressValue, 100, 0, run, (value) => {
      progressValue.textContent = `${Math.round(value)}%`;
      updateProgressMeter(progressMeter, value);
    });

    const flavor = verdict?.metrics_flavor || {};
    for (let index = 0; index < METRIC_ROWS.length; index += 1) {
      const [key, precision] = METRIC_ROWS[index];
      const template = typeof flavor[key] === 'string' ? flavor[key] : FALLBACK_FLAVOR[key];
      await animateMetricRow(
        rows[index],
        template,
        metricValue(metrics, key),
        precision,
        run
      );
    }

    await typeText(divider, '══════════════════════════════', run);
    await typeText(found, 'VERDIKT NALEZEN...', run);
    if (run.cancelled) return { skipped: true, cancelled: true };

    verdictContent.hidden = false;
    targetElement.classList.remove('is-terminal-reading');
    targetElement.classList.add('terminal-readout-complete');
    readout.classList.add('is-complete');
    dispatchComplete(targetElement, metrics, verdict, run.skipped);

    if (!run.skipped) await run.wait(420);
    readout.classList.add('is-leaving');
    if (!run.skipped) await run.wait(220);
    readout.remove();

    return { skipped: run.skipped, cancelled: false };
  } finally {
    run.cleanup();
    if (ACTIVE_READOUTS.get(targetElement) === run) ACTIVE_READOUTS.delete(targetElement);
  }
}

export default animateTerminalReadout;
