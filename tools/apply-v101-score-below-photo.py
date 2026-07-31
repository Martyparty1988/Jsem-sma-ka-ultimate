from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# --- Mobile poster CSS: make the image a real hero region and keep score below it. ---
css_path = ROOT / 'result-poster.css'
css = css_path.read_text(encoding='utf-8')
css = css.replace('/* Smažka v98 — fixed photo layer + one normal-flow mobile result grid. */',
                  '/* Smažka v101 — separate photo hero + score/result panel; no score/photo overlap. */', 1)
css = replace_once(
    css,
    "    --result-safe-bottom: max(12px, env(safe-area-inset-bottom));\n",
    "    --result-safe-bottom: max(12px, env(safe-area-inset-bottom));\n    --poster-photo-height: clamp(320px, 52dvh, 440px);\n",
    'poster photo height variable'
)
css = replace_once(
    css,
    "    grid-template-rows: minmax(112px, 1fr) auto auto auto auto auto;\n    align-items: stretch;\n    gap: 7px;\n    padding: calc(var(--result-safe-top) + 58px) 14px var(--result-safe-bottom) !important;\n",
    "    grid-template-rows: var(--poster-photo-height) auto auto auto auto auto;\n    align-items: stretch;\n    gap: 7px;\n    padding: 0 14px var(--result-safe-bottom) !important;\n",
    'closed poster grid rows'
)
css = replace_once(
    css,
    "      linear-gradient(180deg, rgba(1, 5, 11, 0.02) 0%, rgba(1, 5, 11, 0.01) 34%, rgba(1, 6, 12, 0.08) 48%, rgba(1, 6, 13, 0.46) 63%, rgba(2, 7, 17, 0.88) 78%, #02060c 100%),\n",
    "      linear-gradient(180deg, rgba(1, 5, 11, 0.02) 0%, rgba(1, 5, 11, 0.015) 32%, rgba(1, 6, 12, 0.10) 41%, rgba(2, 7, 17, 0.72) 49%, #02060c 56%, #02060c 100%),\n",
    'poster lower fade'
)
css = css.replace(
    '  /* Closed poster: the photo owns the viewport; runtime promotes score into the grid. */',
    '  /* Closed poster: photo owns only the hero region; score starts after its bottom edge. */',
    1
)
css = replace_once(
    css,
    "    position: fixed !important;\n    inset: 0 !important;\n    z-index: 0 !important;\n    width: 100dvw !important;\n    min-width: 100dvw !important;\n    max-width: none !important;\n    height: 100dvh !important;\n    min-height: 100dvh !important;\n",
    "    position: fixed !important;\n    top: 0 !important;\n    right: 0 !important;\n    bottom: auto !important;\n    left: 0 !important;\n    z-index: 0 !important;\n    width: 100dvw !important;\n    min-width: 100dvw !important;\n    max-width: none !important;\n    height: var(--poster-photo-height) !important;\n    min-height: var(--poster-photo-height) !important;\n",
    'photo hero geometry'
)
css = replace_once(
    css,
    "    position: fixed !important;\n    inset: 0 !important;\n    z-index: 2 !important;\n    width: 100dvw !important;\n    height: 100dvh !important;\n    opacity: 0.07 !important;\n",
    "    position: fixed !important;\n    top: 0 !important;\n    right: 0 !important;\n    bottom: auto !important;\n    left: 0 !important;\n    z-index: 2 !important;\n    width: 100dvw !important;\n    height: var(--poster-photo-height) !important;\n    opacity: 0.07 !important;\n",
    'photo noise geometry'
)
css = replace_once(
    css,
    "@media (max-width: 640px) and (max-height: 740px) {\n  .result-poster-v99:not(.details-open) .result-content {\n    grid-template-rows: minmax(84px, 1fr) auto auto auto auto auto;\n",
    "@media (max-width: 640px) and (max-height: 740px) {\n  .result.result-poster-v99:not(.hidden) {\n    --poster-photo-height: clamp(245px, 43dvh, 315px);\n  }\n\n  .result-poster-v99:not(.details-open) .result-content {\n    grid-template-rows: var(--poster-photo-height) auto auto auto auto auto;\n",
    'compact poster hero geometry'
)
css_path.write_text(css, encoding='utf-8')

# --- Version URLs/cache so iOS Safari cannot keep the old layout. ---
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = replace_once(index, 'result-poster.css?v=99', 'result-poster.css?v=101', 'index poster css URL')
index_path.write_text(index, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8')
sw = replace_once(sw, "const CACHE_VERSION = 'v100';", "const CACHE_VERSION = 'v101';", 'cache version')
sw = replace_once(sw, "const UPDATE_STATE_KEY = './__smazka-update-state-v100';", "const UPDATE_STATE_KEY = './__smazka-update-state-v101';", 'update state key')
sw = replace_once(sw, "'./result-poster.css?v=99',", "'./result-poster.css?v=101',", 'cached poster css URL')
sw_path.write_text(sw, encoding='utf-8')

# Keep tests that assert the current service-worker version aligned.
for test_path in (ROOT / 'tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    text = text.replace("const CACHE_VERSION = 'v100'", "const CACHE_VERSION = 'v101'")
    text = text.replace('jsem-smazka-v100', 'jsem-smazka-v101')
    test_path.write_text(text, encoding='utf-8')

# --- PWA/source contract updates. ---
pwa_path = ROOT / 'tests/pwa-cache.test.mjs'
pwa = pwa_path.read_text(encoding='utf-8')
pwa = pwa.replace("test('PWA v100 precaches one compact production shell with no retired entries'", "test('PWA v101 precaches one compact production shell with no retired entries'", 1)
pwa = pwa.replace("test('HTML entries, bundle sections and dynamic files agree with the v100 cache graph'", "test('HTML entries, bundle sections and dynamic files agree with the v101 cache graph'", 1)
pwa = pwa.replace('result-poster.css?v=99', 'result-poster.css?v=101')
pwa = replace_once(
    pwa,
    "  assert.match(css, /height:\\s*100dvh\\s*!important/);\n  assert.match(css, /grid-template-rows:\\s*minmax\\(112px, 1fr\\) auto auto auto auto auto/);\n",
    "  assert.match(css, /--poster-photo-height:\\s*clamp\\(320px, 52dvh, 440px\\)/);\n  assert.match(css, /height:\\s*var\\(--poster-photo-height\\)\\s*!important/);\n  assert.match(css, /grid-template-rows:\\s*var\\(--poster-photo-height\\) auto auto auto auto auto/);\n  assert.doesNotMatch(css, /\\.result-poster-v99:not\\(\\.details-open\\) \\.result-visual[\\s\\S]{0,360}height:\\s*100dvh/);\n",
    'PWA poster geometry assertions'
)
pwa_path.write_text(pwa, encoding='utf-8')

# --- WebKit regression: score must not overlap the photo at all. ---
e2e_path = ROOT / 'tests/e2e/mobile-result.spec.mjs'
e2e = e2e_path.read_text(encoding='utf-8')
e2e = replace_once(
    e2e,
    "  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);\n  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height - 1);\n\n  const scoreStyle",
    "  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);\n  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height * 0.35);\n  expect(visualBox.height).toBeLessThan(viewport.height * 0.7);\n  expect(visualBox.y + visualBox.height).toBeLessThanOrEqual(scoreBox.y + 1);\n\n  const scoreStyle",
    'primary WebKit photo/score geometry'
)
e2e = replace_once(
    e2e,
    "  const visual = page.locator('.result-visual');\n  const viewport = page.viewportSize();\n  const visualBox = await visual.boundingBox();\n  expect(viewport && visualBox).toBeTruthy();\n",
    "  const visual = page.locator('.result-visual');\n  const score = page.locator('.effect-label.result-score');\n  const viewport = page.viewportSize();\n  const visualBox = await visual.boundingBox();\n  const scoreBox = await score.boundingBox();\n  expect(viewport && visualBox && scoreBox).toBeTruthy();\n",
    'legacy-state WebKit score geometry setup'
)
e2e = replace_once(
    e2e,
    "  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);\n  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height - 1);\n\n  await page.screenshot({ path: testInfo.outputPath('result-real-scan-state.png'), fullPage: false });\n",
    "  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);\n  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height * 0.35);\n  expect(visualBox.height).toBeLessThan(viewport.height * 0.7);\n  expect(visualBox.y + visualBox.height).toBeLessThanOrEqual(scoreBox.y + 1);\n\n  await page.screenshot({ path: testInfo.outputPath('result-real-scan-state.png'), fullPage: false });\n",
    'legacy-state WebKit photo/score geometry'
)
e2e_path.write_text(e2e, encoding='utf-8')

print('Applied v101: separate photo hero and score panel with a hard no-overlap WebKit contract.')
