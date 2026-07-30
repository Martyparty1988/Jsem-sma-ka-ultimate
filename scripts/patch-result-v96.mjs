import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content);

function replaceOnce(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing patch target: ${label}`);
  return content.replace(from, to);
}

function bump(path) {
  const source = read(path);
  if (!source.includes('v95')) throw new Error(`Missing v95 marker in ${path}`);
  write(path, source.replaceAll('v95', 'v96'));
}

[
  'index.html',
  'service-worker.js',
  'result-poster.css',
  'result-poster-runtime.js',
  'tests/analysis-completion-guard-v84.test.mjs',
  'tests/analysis-rescue-v85.test.mjs',
  'tests/critical-impact-reveal-v82.test.mjs',
  'tests/pwa-cache.test.mjs',
  'tests/pwa-update-delivery-v93.test.mjs'
].forEach(bump);

let css = read('result-poster.css');
css = replaceOnce(css, `  /* Closed poster: the figure box disappears, its children join the main grid. */
  .result-poster-v96:not(.details-open) .result-visual {
    display: contents !important;
  }

  .result-poster-v96:not(.details-open) .result-visual img,
  .result-poster-v96:not(.details-open) .result-visual canvas {
    position: fixed !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: 100dvw !important;
    min-width: 100dvw !important;
    max-width: none !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: none !important;
    display: block !important;
    object-fit: cover !important;
    object-position: 50% 40% !important;
    transform: none !important;
    filter: saturate(1.06) contrast(1.04) brightness(0.95);
    pointer-events: none !important;
  }`, `  /* Closed poster: the photo owns the viewport; runtime promotes score into the grid. */
  .result-poster-v96:not(.details-open) .result-visual {
    position: fixed !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: 100dvw !important;
    min-width: 100dvw !important;
    max-width: none !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: none !important;
    margin: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #030810 !important;
    pointer-events: none !important;
  }

  .result-poster-v96:not(.details-open) .result-visual img,
  .result-poster-v96:not(.details-open) .result-visual canvas {
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: 100% !important;
    min-width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 100% !important;
    max-height: none !important;
    display: block !important;
    object-fit: cover !important;
    object-position: 50% 40% !important;
    transform: none !important;
    filter: saturate(1.06) contrast(1.04) brightness(0.95);
    pointer-events: none !important;
  }`, 'fixed figure block');

css = replaceOnce(css, `    width: min(100%, 370px) !important;
    min-height: 104px;`, `    width: min(100%, 370px) !important;
    max-width: calc(100dvw - 28px) !important;
    min-width: 0 !important;
    min-height: 104px;`, 'score width guard');

css = replaceOnce(css, `  .result-poster-v96:not(.details-open) .effect-label strong {
    display: block;
    color: #33ebef !important;
    font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "SF Pro Display", sans-serif;
    font-size: clamp(3.75rem, 19vw, 5.6rem) !important;
    font-style: italic;
    font-weight: 950 !important;
    letter-spacing: -0.075em;
    line-height: 0.84;
    text-shadow: 3px 3px 0 rgba(5, 122, 148, 0.48), 0 0 20px rgba(36, 229, 238, 0.4), 0 14px 28px rgba(0, 0, 0, 0.52) !important;
  }`, `  .result-poster-v96:not(.details-open) .effect-label strong {
    display: block;
    max-width: 100%;
    padding-inline: 0.08em 0.12em;
    color: #33ebef !important;
    font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "SF Pro Display", sans-serif;
    font-size: clamp(3.4rem, 17vw, 5rem) !important;
    font-style: italic;
    font-weight: 950 !important;
    letter-spacing: -0.045em;
    line-height: 0.86;
    white-space: nowrap;
    text-shadow: 3px 3px 0 rgba(5, 122, 148, 0.48), 0 0 20px rgba(36, 229, 238, 0.4), 0 14px 28px rgba(0, 0, 0, 0.52) !important;
  }`, 'score typography guard');

css = replaceOnce(css, `  .result-poster-v96:not(.details-open) .effect-label,
  .result-poster-v96:not(.details-open) .effect-label.result-score {`, `  .result-poster-v96 .result-badge {
    font-size: 0 !important;
  }

  .result-poster-v96 .result-badge::after {
    content: 'SMAŽKA FAKTOR';
    font-size: clamp(0.62rem, 2.8vw, 0.74rem);
    font-weight: 900;
    letter-spacing: 0.18em;
    line-height: 1;
    white-space: nowrap;
  }

  .result-poster-v96:not(.details-open) .effect-label,
  .result-poster-v96:not(.details-open) .effect-label.result-score {`, 'factor badge visual guard');
write('result-poster.css', css);

let runtime = read('result-poster-runtime.js');
runtime = replaceOnce(runtime, `  function currentBadgeLabel() {
    const weekday = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long' })
      .format(new Date())
      .toLocaleUpperCase('cs-CZ');
    return \`SCAN • \${weekday}\`;
  }`, `  function currentBadgeLabel() {
    return 'SMAŽKA FAKTOR';
  }`, 'badge label');

runtime = replaceOnce(runtime, `  function updateDetailsLabel(button) {`, `  function promoteScore() {
    const content = result.querySelector('.result-content');
    const visual = content?.querySelector('.result-visual');
    const score = result.querySelector('.effect-label');
    if (!content || !visual || !score) return;

    score.classList.add('result-score');
    if (score.parentElement !== content || score.previousElementSibling !== visual) {
      visual.insertAdjacentElement('afterend', score);
    }
  }

  function updateDetailsLabel(button) {`, 'score promotion function');

runtime = replaceOnce(runtime, `    appRoot?.toggleAttribute('inert', true);
    ensureDetailsButton();
    normalizeBadge();`, `    appRoot?.toggleAttribute('inert', true);
    promoteScore();
    ensureDetailsButton();
    normalizeBadge();`, 'score promotion call');
write('result-poster-runtime.js', runtime);

let pwaTest = read('tests/pwa-cache.test.mjs');
pwaTest = replaceOnce(pwaTest, `test('v96 fixes the photo to the viewport and keeps score in normal grid flow', () => {`, `test('v96 keeps the photo fixed, promotes score into the grid and labels the factor', () => {`, 'pwa test title');
pwaTest = replaceOnce(pwaTest, `  assert.match(runtime, /new Intl\\.DateTimeFormat\\('cs-CZ', \\{ weekday: 'long' \\}\\)/);
  assert.match(runtime, /return \`SCAN • \\$\\{weekday\\}\`/);`, `  assert.match(runtime, /return 'SMAŽKA FAKTOR'/);
  assert.match(runtime, /function promoteScore\\(\\)/);
  assert.match(runtime, /visual\\.insertAdjacentElement\\('afterend', score\\)/);`, 'runtime expectations');
pwaTest = replaceOnce(pwaTest, `  assert.match(css, /\\.result-poster-v96:not\\(\\.details-open\\) \\.result-visual\\s*\\{\\s*display:\\s*contents\\s*!important/);`, `  assert.match(css, /\\.result-poster-v96:not\\(\\.details-open\\) \\.result-visual\\s*\\{[\\s\\S]*position:\\s*fixed\\s*!important/);
  assert.doesNotMatch(css, /display:\\s*contents\\s*!important/);
  assert.match(css, /content:\\s*'SMAŽKA FAKTOR'/);`, 'css fixed figure expectation');
pwaTest = pwaTest.replace(
  /result-poster\\\.css\\\?v=\(\?:89\|91\|92\|93\|94\)/g,
  'result-poster\\.css\\?v=(?:89|91|92|93|94|95)'
).replace(
  /result-poster-runtime\\\.js\\\?v=\(\?:89\|91\|92\|93\|94\)/g,
  'result-poster-runtime\\.js\\?v=(?:89|91|92|93|94|95)'
).replace(
  /result-poster-v\(\?:89\|91\|92\|93\|94\)/g,
  'result-poster-v(?:89|91|92|93|94|95)'
);
write('tests/pwa-cache.test.mjs', pwaTest);

const originalWorkflow = `name: Regression tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run test suite
        run: node --test tests/*.test.mjs
`;
write('.github/workflows/tests.yml', originalWorkflow);
fs.unlinkSync('scripts/patch-result-v96.mjs');
