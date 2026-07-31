from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

screens_path = ROOT / 'screens.css'
screens = screens_path.read_text(encoding='utf-8')

# Legacy reveal animations may transform the parent of the new fixed photo layer.
# In WebKit, a transformed ancestor establishes the containing block for fixed descendants.
content_block = """.result:not(.hidden) .result-content {
  animation: resultContentReveal 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
content_scoped = """.result:not(.hidden):not(.result-poster-v99) .result-content {
  animation: resultContentReveal 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
if screens.count(content_block) != 1:
    raise RuntimeError('Could not isolate the legacy resultContentReveal block')
screens = screens.replace(content_block, content_scoped, 1)

visual_reveal_block = """.result:not(.hidden) .result-visual {
  isolation: isolate;
  animation: resultVisualReveal 0.66s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
visual_reveal_scoped = """.result:not(.hidden):not(.result-poster-v99) .result-visual {
  isolation: isolate;
  animation: resultVisualReveal 0.66s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
if screens.count(visual_reveal_block) != 1:
    raise RuntimeError('Could not isolate the legacy resultVisualReveal block')
screens = screens.replace(visual_reveal_block, visual_reveal_scoped, 1)

professional_block = """.result:not(.hidden) .result-visual {
  animation: professionalResultReveal 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
professional_scoped = """.result:not(.hidden):not(.result-poster-v99) .result-visual {
  animation: professionalResultReveal 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
if screens.count(professional_block) != 1:
    raise RuntimeError('Could not isolate the legacy professionalResultReveal block')
screens = screens.replace(professional_block, professional_scoped, 1)

image_block = """.result-visual img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  animation: meltReveal 1.08s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
image_replacement = """.result-visual img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.result:not(.result-poster-v99) .result-visual img {
  animation: meltReveal 1.08s cubic-bezier(0.16, 1, 0.3, 1) both;
}
"""
if screens.count(image_block) != 1:
    raise RuntimeError('Could not isolate the legacy meltReveal image block')
screens = screens.replace(image_block, image_replacement, 1)
screens_path.write_text(screens, encoding='utf-8')

# The changed CSS needs a new request URL so installed Safari/PWA clients cannot reuse v99.
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
if index.count('screens.css?v=99') != 1:
    raise RuntimeError('Expected one screens.css?v=99 reference in index.html')
index = index.replace('screens.css?v=99', 'screens.css?v=100')
index_path.write_text(index, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8')
if sw.count("./screens.css?v=99") != 1:
    raise RuntimeError('Expected one cached screens.css?v=99 entry')
sw = sw.replace("./screens.css?v=99", "./screens.css?v=100")
sw_path.write_text(sw, encoding='utf-8')

# Keep URL contracts aligned.
for test_path in (ROOT / 'tests').rglob('*.mjs'):
    text = test_path.read_text(encoding='utf-8')
    if 'screens.css?v=99' in text:
        test_path.write_text(text.replace('screens.css?v=99', 'screens.css?v=100'), encoding='utf-8')

# Strengthen the source contract: poster cannot inherit transform-producing reveal animations.
pwa_path = ROOT / 'tests/pwa-cache.test.mjs'
pwa = pwa_path.read_text(encoding='utf-8')
source_decl = "  const index = readRoot('index.html');\n  const css = readRoot('result-poster.css');\n  const runtime = readRoot('result-poster-runtime.js');\n"
source_decl_with_screens = "  const index = readRoot('index.html');\n  const css = readRoot('result-poster.css');\n  const screens = readRoot('screens.css');\n  const runtime = readRoot('result-poster-runtime.js');\n"
if pwa.count(source_decl) != 1:
    raise RuntimeError('Could not add screens source to poster ownership contract')
pwa = pwa.replace(source_decl, source_decl_with_screens, 1)

needle = "  assert.match(css, /grid-template-rows:\\s*minmax\\(112px, 1fr\\) auto auto auto auto auto/);\n"
addition = needle + "  assert.doesNotMatch(screens, /\\.result:not\\(\\.hidden\\) \\.result-content\\s*\\{\\s*animation:\\s*resultContentReveal/);\n  assert.doesNotMatch(screens, /\\.result:not\\(\\.hidden\\) \\.result-visual\\s*\\{[\\s\\S]{0,160}animation:\\s*(?:resultVisualReveal|professionalResultReveal)/);\n  assert.match(screens, /\\.result:not\\(\\.hidden\\):not\\(\\.result-poster-v99\\) \\.result-content\\s*\\{\\s*animation:\\s*resultContentReveal/);\n  assert.match(screens, /\\.result:not\\(\\.result-poster-v99\\) \\.result-visual img\\s*\\{\\s*animation:\\s*meltReveal/);\n"
if pwa.count(needle) != 1:
    raise RuntimeError('Could not find poster grid contract insertion point')
pwa = pwa.replace(needle, addition, 1)
pwa_path.write_text(pwa, encoding='utf-8')

# Replace temporary diagnostics with permanent geometry + cascade assertions.
e2e_path = ROOT / 'tests/e2e/mobile-result.spec.mjs'
e2e = e2e_path.read_text(encoding='utf-8')
start = e2e.find("  const layout = await page.evaluate(() => {\n", e2e.find("test('v100 poster retires"))
end_marker = "  await page.screenshot({ path: testInfo.outputPath('result-real-scan-state.png'), fullPage: false });\n"
end = e2e.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('Could not locate temporary poster diagnostic block')
end += len(end_marker)
replacement = """  const layout = await page.evaluate(() => {
    const result = document.querySelector('#result');
    const content = document.querySelector('.result-content');
    const visual = document.querySelector('.result-visual');
    const image = visual?.querySelector('img, canvas');
    const resultRect = result.getBoundingClientRect();
    const contentStyle = getComputedStyle(content);
    const visualStyle = getComputedStyle(visual);
    const imageStyle = image ? getComputedStyle(image) : null;
    return {
      resultRect: { x: resultRect.x, y: resultRect.y, width: resultRect.width, height: resultRect.height },
      contentDisplay: contentStyle.display,
      contentColumns: contentStyle.gridTemplateColumns.split(/\\s+/).filter(Boolean),
      contentTransform: contentStyle.transform,
      contentAnimation: contentStyle.animationName,
      visualPosition: visualStyle.position,
      visualAnimation: visualStyle.animationName,
      imageAnimation: imageStyle?.animationName || 'none'
    };
  });

  expect(layout.resultRect.x).toBeCloseTo(0, 0);
  expect(layout.resultRect.y).toBeCloseTo(0, 0);
  expect(layout.resultRect.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(layout.resultRect.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(layout.contentDisplay).toBe('grid');
  expect(layout.contentColumns).toHaveLength(1);
  expect(layout.contentTransform).toBe('none');
  expect(layout.contentAnimation).toBe('none');
  expect(layout.visualPosition).toBe('fixed');
  expect(layout.visualAnimation).toBe('none');
  expect(layout.imageAnimation).toBe('none');
  expect(Math.abs(visualBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualBox.y)).toBeLessThanOrEqual(1);
  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height - 1);

  await page.screenshot({ path: testInfo.outputPath('result-real-scan-state.png'), fullPage: false });
"""
e2e = e2e[:start] + replacement + e2e[end:]

# The ordinary result test must also guard the photo layer, not only text/score geometry.
first_anchor = "  const closeBox = await close.boundingBox();\n  expect(viewport && badgeBox && scoreBox && actionsBox && closeBox).toBeTruthy();\n"
first_replacement = "  const closeBox = await close.boundingBox();\n  const visualBox = await page.locator('.result-visual').boundingBox();\n  expect(viewport && badgeBox && scoreBox && actionsBox && closeBox && visualBox).toBeTruthy();\n  expect(Math.abs(visualBox.x)).toBeLessThanOrEqual(1);\n  expect(Math.abs(visualBox.y)).toBeLessThanOrEqual(1);\n  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);\n  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height - 1);\n"
if e2e.count(first_anchor) != 1:
    raise RuntimeError('Could not strengthen ordinary visual geometry test')
e2e = e2e.replace(first_anchor, first_replacement, 1)
e2e_path.write_text(e2e, encoding='utf-8')

print('Scoped only the diagnosed legacy reveal animations away from the poster and strengthened real WebKit geometry checks.')
