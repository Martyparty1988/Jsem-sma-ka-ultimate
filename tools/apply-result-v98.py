from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    if source.count(old) != 1:
        raise RuntimeError(f"Expected one match in {path}: {old[:80]!r}; got {source.count(old)}")
    write(path, source.replace(old, new, 1))


# Render the semantic result structure correctly at the source.
replace_once(
    "app.js",
    "    const todayLabel = capitalizeFirst(getTodayForms().nominative);\n",
    "",
)
replace_once(
    "app.js",
    "    badge.textContent = `VOID VERDIKT // ${todayLabel}`;",
    "    badge.textContent = 'SMAŽKA FAKTOR';",
)
replace_once(
    "app.js",
    "    effectLabel.className = 'effect-label';",
    "    effectLabel.className = 'effect-label result-score';",
)
replace_once(
    "app.js",
    "    resultVisual.append(effectImage, effectNoise, badge, effectLabel);",
    "    resultVisual.append(effectImage, effectNoise);",
)
replace_once(
    "app.js",
    "    content.append(resultVisual, title, text, actions);",
    "    content.append(resultVisual, badge, effectLabel, title, text, actions);",
)

# Lifecycle may decorate metadata, but it no longer owns badge text or score placement.
replace_once(
    "lifecycle-runtime.js",
    "    const badge = result.querySelector('.result-badge');\n    if (badge) badge.textContent = 'VOID VERDIKT';\n\n",
    "",
)
replace_once(
    "lifecycle-runtime.js",
    "    const visual = result.querySelector('.result-visual');\n    const effectLabel = visual?.querySelector('.effect-label');\n    if (visual && effectLabel) {",
    "    const effectLabel = result.querySelector('.effect-label');\n    if (effectLabel) {",
)
replace_once(
    "lifecycle-runtime.js",
    "        visual.insertAdjacentElement('afterend', meta);",
    "        effectLabel.insertAdjacentElement('afterend', meta);",
)

# Small state-only runtime: no geometry, no DOM relocation, no settle loops.
write(
    "result-poster-runtime.js",
    """/* Smažka v98 — source DOM owns composition; runtime owns identity and detail state only. */
(() => {
  'use strict';

  const VERSION = 'v98';
  const POSTER_CLASS = 'result-poster-v98';
  const app = window.SmazkaApp;
  const result = app?.elements?.result;
  if (!result) return;

  const cameraStage = app.elements.cameraStage;
  const appRoot = app.elements.app;
  const Observer = window.SmazkaMutationObserver || window.MutationObserver;
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  let animationFrame = 0;

  function installPosterIdentity() {
    [...result.classList]
      .filter((name) => /^result-poster-v\\d+$/.test(name) && name !== POSTER_CLASS)
      .forEach((name) => result.classList.remove(name));
    result.classList.add(POSTER_CLASS);
    result.dataset.resultPoster = VERSION;
  }

  function resultVisible() {
    return !result.classList.contains('hidden')
      && (result.open || result.hasAttribute('open') || document.body.classList.contains('result-open'));
  }

  function normalizeBadge() {
    const badge = result.querySelector('.result-badge');
    if (badge && badge.textContent !== 'SMAŽKA FAKTOR') badge.textContent = 'SMAŽKA FAKTOR';
  }

  function updateDetailsLabel(button) {
    if (!button) return;
    const open = result.classList.contains('details-open');
    button.setAttribute('aria-expanded', String(open));
    const label = button.querySelector('.in-frame-details-label');
    if (label) label.textContent = open ? 'Skrýt detailní rozbor' : 'Zobrazit detailní rozbor';
  }

  function setDetailsOpen(open) {
    result.classList.toggle('details-open', open);
    const button = result.querySelector('.in-frame-details-toggle');
    updateDetailsLabel(button);

    window.requestAnimationFrame(() => {
      const content = result.querySelector('.result-content');
      if (!content) return;
      if (!open) {
        content.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }
      const panel = result.querySelector('.diagnostic-panel');
      if (!panel || !button) return;
      content.scrollTo?.({
        top: Math.max(0, panel.offsetTop - button.offsetHeight - 8),
        behavior: 'smooth'
      });
    });
  }

  function ensureDetailsButton() {
    const description = result.querySelector('.description');
    if (!description) return null;

    let button = result.querySelector('.in-frame-details-toggle');
    if (!button || button.dataset.posterOwner !== VERSION) {
      const replacement = document.createElement('button');
      replacement.type = 'button';
      replacement.className = 'in-frame-details-toggle';
      replacement.dataset.posterOwner = VERSION;
      replacement.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span class="in-frame-details-label">Zobrazit detailní rozbor</span><i aria-hidden="true">⌄</i>';
      replacement.addEventListener('click', () => {
        setDetailsOpen(!result.classList.contains('details-open'));
      });
      button?.replaceWith(replacement);
      button = replacement;
    }

    if (button.previousElementSibling !== description) description.insertAdjacentElement('afterend', button);
    updateDetailsLabel(button);
    return button;
  }

  function syncFrame() {
    installPosterIdentity();
    if (!mobileQuery.matches || !resultVisible()) {
      result.classList.remove('details-open');
      document.body.classList.remove('result-in-frame');
      cameraStage?.classList.remove('has-in-frame-result');
      if (!resultVisible()) appRoot?.removeAttribute('inert');
      return;
    }

    document.body.classList.add('result-in-frame');
    cameraStage?.classList.add('has-in-frame-result');
    appRoot?.toggleAttribute('inert', true);
    normalizeBadge();
    ensureDetailsButton();
  }

  function scheduleSync() {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(syncFrame);
  }

  installPosterIdentity();

  const observer = new Observer(scheduleSync);
  observer.observe(result, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'open']
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', scheduleSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
  mobileQuery.addEventListener?.('change', scheduleSync);

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(animationFrame);
  }, { once: true });

  window.SmazkaResultPoster = Object.freeze({ version: 98, sync: scheduleSync });
  scheduleSync();
})();
""",
)

# Promote v98 and remove generated semantic text from CSS.
css = read("result-poster.css").replace("v96", "v98")
css = css.replace(
    "    font-size: 0 !important;\n    font-weight: 900 !important;\n    letter-spacing: 0 !important;",
    "    font-size: clamp(0.62rem, 2.8vw, 0.74rem) !important;\n    font-weight: 900 !important;\n    letter-spacing: 0.18em !important;",
    1,
)
pseudo_block = """  .result-poster-v98 .result-badge {
    font-size: 0 !important;
  }

  .result-poster-v98 .result-badge::after {
    content: 'SMAŽKA FAKTOR';
    font-size: clamp(0.62rem, 2.8vw, 0.74rem);
    font-weight: 900;
    letter-spacing: 0.18em;
    line-height: 1;
    white-space: nowrap;
  }

"""
if pseudo_block not in css:
    raise RuntimeError("Missing generated badge CSS block")
css = css.replace(pseudo_block, "", 1)
write("result-poster.css", css)

# Cache-bust every modified production asset.
index = read("index.html")
for old, new in [
    ("result-poster.css?v=96", "result-poster.css?v=98"),
    ("result result-poster-v96 hidden", "result result-poster-v98 hidden"),
    ('data-result-poster="v96"', 'data-result-poster="v98"'),
    ("app.js?v=87", "app.js?v=98"),
    ("lifecycle-runtime.js?v=87", "lifecycle-runtime.js?v=98"),
    ("result-poster-runtime.js?v=96", "result-poster-runtime.js?v=98"),
]:
    if old not in index:
        raise RuntimeError(f"Missing index version target: {old}")
    index = index.replace(old, new, 1)
write("index.html", index)

sw = read("service-worker.js")
for old, new in [
    ("const CACHE_VERSION = 'v96'", "const CACHE_VERSION = 'v98'"),
    ("./__smazka-update-state-v96", "./__smazka-update-state-v98"),
    ("./result-poster.css?v=96", "./result-poster.css?v=98"),
    ("./app.js?v=87", "./app.js?v=98"),
    ("./lifecycle-runtime.js?v=87", "./lifecycle-runtime.js?v=98"),
    ("./result-poster-runtime.js?v=96", "./result-poster-runtime.js?v=98"),
]:
    if old not in sw:
        raise RuntimeError(f"Missing service worker target: {old}")
    sw = sw.replace(old, new, 1)
write("service-worker.js", sw)

# Update static contracts to the actual cache graph.
for path in [
    "tests/analysis-completion-guard-v84.test.mjs",
    "tests/analysis-rescue-v85.test.mjs",
    "tests/critical-impact-reveal-v82.test.mjs",
    "tests/pwa-cache.test.mjs",
    "tests/pwa-update-delivery-v93.test.mjs",
]:
    source = read(path).replace("v96", "v98")
    source = source.replace("./app.js?v=87", "./app.js?v=98")
    source = source.replace("./lifecycle-runtime.js?v=87", "./lifecycle-runtime.js?v=98")
    source = source.replace("app.js?v=87", "app.js?v=98")
    source = source.replace("lifecycle-runtime.js?v=87", "lifecycle-runtime.js?v=98")
    write(path, source)

# Replace outdated ownership assertions with source-owned contracts.
pwa = read("tests/pwa-cache.test.mjs")
pwa = pwa.replace("promotes score into the grid", "renders score directly in the grid")
pwa = pwa.replace("assert.match(runtime, /function promoteScore\\(\\)/);\n", "")
pwa = pwa.replace("assert.match(runtime, /visual\\.insertAdjacentElement\\('afterend', score\\)/);\n", "")
pwa = pwa.replace(
    "assert.match(css, /content:\\s*'SMAŽKA FAKTOR'/);",
    "assert.doesNotMatch(css, /result-badge::after|content:\\s*'SMAŽKA FAKTOR'/);",
)
write("tests/pwa-cache.test.mjs", pwa)

write(
    "tests/result-source-ownership.test.mjs",
    """import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('result semantics and order are owned by app render source', () => {
  const app = readRoot('app.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const poster = readRoot('result-poster-runtime.js');
  const css = readRoot('result-poster.css');

  assert.match(app, /badge\.textContent = 'SMAŽKA FAKTOR'/);
  assert.match(app, /effectLabel\.className = 'effect-label result-score'/);
  assert.match(app, /resultVisual\.append\(effectImage, effectNoise\)/);
  assert.match(app, /content\.append\(resultVisual, badge, effectLabel, title, text, actions\)/);
  assert.doesNotMatch(app, /VOID VERDIKT \/\/ \$\{todayLabel\}/);

  assert.doesNotMatch(lifecycle, /badge\.textContent = 'VOID VERDIKT'/);
  assert.match(lifecycle, /result\.querySelector\('\.effect-label'\)/);
  assert.doesNotMatch(lifecycle, /visual\?\.querySelector\('\.effect-label'\)/);

  assert.doesNotMatch(poster, /promoteScore|settleVisibleResult|settleAttempts/);
  assert.doesNotMatch(css, /result-badge::after|content:\s*'SMAŽKA FAKTOR'/);
});
""",
)

# Dev-only WebKit checks: no runtime dependency is shipped to users.
write(
    "package.json",
    """{
  "name": "jsem-smazka-ultimate",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1"
  }
}
""",
)

write(
    "playwright.config.mjs",
    """import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 6_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'cs-CZ',
    colorScheme: 'dark',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  },
  projects: [
    {
      name: 'webkit-393x852',
      use: { ...devices['iPhone 13'], viewport: { width: 393, height: 852 } }
    },
    {
      name: 'webkit-393x700',
      use: { ...devices['iPhone 13'], viewport: { width: 393, height: 700 } }
    }
  ]
});
""",
)

write(
    "tests/e2e/mobile-result.spec.mjs",
    """import { test, expect } from '@playwright/test';

const photo = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="480" height="640">
    <defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#d8c8b5"/><stop offset="1" stop-color="#352a2e"/></linearGradient></defs>
    <rect width="480" height="640" fill="url(#g)"/>
    <circle cx="240" cy="280" r="150" fill="#a97867"/>
    <circle cx="185" cy="250" r="18" fill="#17212a"/><circle cx="295" cy="250" r="18" fill="#17212a"/>
    <path d="M170 365 Q240 410 310 365" fill="none" stroke="#3a1820" stroke-width="18"/>
  </svg>`)};

async function openDeterministicResult(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.SmazkaApp));
  await page.evaluate(async (image) => {
    window.SmazkaFaceWarp = {
      renderFaceEffect: async () => ({
        finalDataUrl: image,
        seed: 1,
        effect: 'facial-drift',
        label: 'Posun proporcí'
      })
    };
    window.SmazkaApp.setCurrentImageData(image);
    window.SmazkaApp.runAnalysis({
      skipImageCheck: true,
      severity: 61,
      verdict: {
        id: 'layout-contract',
        category: 'Čistá lajna',
        description: 'Zorníčky jak měsíční krajina. Na orbitě, ale s úsměvem.',
        severity: { min: 61, max: 61 },
        effect: 'facial-drift',
        signals: []
      }
    });
  }, photo);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });
}

for (const viewportName of ['mobile result']) {
  test(`${viewportName} keeps badge, score and actions inside the viewport`, async ({ page }, testInfo) => {
    await openDeterministicResult(page);

    const badge = page.locator('.result-badge');
    const score = page.locator('.effect-label.result-score');
    const actions = page.locator('.result-actions');
    const close = page.locator('.result-close');

    await expect(badge).toHaveText('SMAŽKA FAKTOR');
    await expect(score).toContainText('61%');
    expect(await score.evaluate((node) => node.parentElement?.classList.contains('result-content'))).toBe(true);

    const viewport = page.viewportSize();
    const badgeBox = await badge.boundingBox();
    const scoreBox = await score.boundingBox();
    const actionsBox = await actions.boundingBox();
    const closeBox = await close.boundingBox();
    expect(viewport && badgeBox && scoreBox && actionsBox && closeBox).toBeTruthy();

    expect(scoreBox.x).toBeGreaterThanOrEqual(10);
    expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(viewport.width - 10 + 1);
    expect(badgeBox.y + badgeBox.height).toBeLessThan(scoreBox.y);
    expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await page.screenshot({ path: testInfo.outputPath('result.png') });
  });
}
""",
)

write(
    "AGENTS.md",
    """# Jsem Smažka Ultimate — agent rules

Read these project skills before editing production UI or PWA code:

- `skills/smazka-mobile-pwa/SKILL.md`
- `skills/smazka-safe-refactor/SKILL.md`

Hard rules:

1. Never edit `responses.json`, `responses-hard.json`, or `responses-pernik.json` unless the user explicitly asks to change app copy.
2. Keep runtime dependency-free and offline-first. Development-only test dependencies are allowed.
3. One element has one owner: semantic text and DOM order come from render source; CSS owns presentation; small runtime modules own state only.
4. Never repair layout by repeatedly moving nodes after render, recursive animation-frame settling, delayed timeouts, or generated CSS text.
5. Every modified production asset must receive a matching query-string version and service-worker app-shell entry.
6. Before merge, run Node contracts plus WebKit mobile checks at 393×852 and 393×700.
""",
)

write(
    "skills/smazka-mobile-pwa/SKILL.md",
    """# Skill: Smažka mobile PWA layout

## Goal

Build a stable iPhone result screen without changing verdict logic, biometric calculations, satire, or response packs.

## Required method

1. Map ownership before editing: render source, state runtime, CSS selector, service-worker URL, and test.
2. Put semantic labels and final DOM order in the renderer. Do not create visible labels with `content:` and do not relocate structural nodes after render.
3. Use native `<dialog>.showModal()` as the modal/top-layer owner. Style `::backdrop`; do not simulate additional competing modal layers.
4. For mobile height, prefer `100dvh` with a safe fallback and `env(safe-area-inset-*)`. Remember that dynamic viewport units resize with browser chrome.
5. Keep fixed photo/background layers independent from content flow. Score, title, description and actions belong to one normal-flow grid.
6. Verify touch targets are at least 44×44 CSS px and that no horizontal overflow exists.
7. Test WebKit at 393×852 and 393×700. Save screenshots or traces on failure.
8. Bump the PWA cache and every changed asset URL together; stale URLs are a failed release.

## Primary references

- WebKit: New viewport units in Safari 15.4 — https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/
- MDN: dynamic viewport lengths — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
- MDN: `<dialog>` and `showModal()` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
- Playwright: mobile emulation — https://playwright.dev/docs/emulation
- Playwright: visual comparisons — https://playwright.dev/docs/test-snapshots
""",
)

write(
    "skills/smazka-safe-refactor/SKILL.md",
    """# Skill: Smažka safe refactor

## Goal

Replace obsolete ownership and cascade hacks instead of stacking another patch on top.

## Workflow

1. Start from current `main`; never rely on historical line numbers.
2. Search all writers of the affected class, text, attribute and DOM node.
3. Choose one authoritative owner and delete or neutralize competing writers.
4. Prefer source fixes over observers, timeout repairs, inline `!important`, and duplicated selectors.
5. Keep changes narrow: no redesign, no verdict-copy edits, no biometric changes.
6. Add a regression contract that would fail if the removed writer or layout hack returns.
7. Run syntax checks, all Node tests, WebKit mobile tests, and inspect the final diff.
8. Merge only when GitHub Actions and Vercel are green; then verify the production commit, not only the preview branch.

## Release checklist

- response JSON files untouched
- no retired version selectors or cache URLs
- no generated semantic CSS text
- no post-render score relocation
- app-shell URLs match HTML
- 44×44 close target
- 393×852 and 393×700 WebKit checks pass
- production Vercel deployment is green
""",
)

# README now describes the real production and test architecture.
readme = read("README.md")
readme = readme.replace(
    "- `screens.css` – výsledek, responzivní/iPhone geometrie a finální VOID kaskáda.\n",
    "- `screens.css` – obecné obrazovky a starší sdílené výsledkové komponenty.\n- `result-poster.css` – jediná mobilní kompozice výsledku, safe-area a detailní režim.\n",
)
readme = readme.replace(
    "- `lifecycle-runtime.js` – výsledkový lifecycle, recovery, share cover a PWA update UI.\n",
    "- `lifecycle-runtime.js` – recovery, reveal, share cover a PWA update lifecycle; nevlastní geometrii posteru.\n- `result-poster-runtime.js` – identita posteru a stav detailního rozboru; nepřesouvá výsledkové uzly.\n",
)
readme = readme.replace(
    "Testy používají vestavěný Node test runner:\n\n```bash\nnode --test tests/*.test.mjs\n```\n",
    "Statické a datové kontrakty používají vestavěný Node test runner:\n\n```bash\nnpm test\n```\n\nMobilní výsledek se navíc ověřuje ve WebKitu na 393×852 a 393×700:\n\n```bash\nnpm run test:e2e\n```\n",
)
write("README.md", readme)

# The committed workflow is read-only and always runs both suites.
write(
    ".github/workflows/tests.yml",
    """name: Regression tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  unit:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Run Node contracts
        run: npm test

  mobile-webkit:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install WebKit
        run: npx playwright install --with-deps webkit
      - name: Run mobile result checks
        run: npm run test:e2e
      - name: Upload browser diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mobile-webkit-diagnostics
          path: |
            test-results
            playwright-report
          if-no-files-found: ignore
          retention-days: 7
""",
)

print("Applied source-owned v98 result refactor.")
