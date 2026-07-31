import { test, expect } from '@playwright/test';

const photoSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640">',
  '<defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#d8c8b5"/><stop offset="1" stop-color="#352a2e"/></linearGradient></defs>',
  '<rect width="480" height="640" fill="url(#g)"/>',
  '<circle cx="240" cy="280" r="150" fill="#a97867"/>',
  '<circle cx="185" cy="250" r="18" fill="#17212a"/>',
  '<circle cx="295" cy="250" r="18" fill="#17212a"/>',
  '<path d="M170 365 Q240 410 310 365" fill="none" stroke="#3a1820" stroke-width="18"/>',
  '</svg>'
].join('');
const photo = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(photoSvg)}`;

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

test('mobile result keeps badge, score and actions inside the viewport', async ({ page }, testInfo) => {
  await openDeterministicResult(page);

  const badge = page.locator('.result-badge');
  const score = page.locator('.effect-label.result-score');
  const scoreValue = score.locator('strong');
  const actions = page.locator('.result-actions');
  const close = page.locator('.result-close');

  await expect(badge).toHaveText('SMAŽKA FAKTOR');
  await expect(scoreValue).toHaveText(/^(?:100|[1-9]?\d)%$/);
  expect(await score.evaluate((node) => node.parentElement?.classList.contains('result-content'))).toBe(true);

  const viewport = page.viewportSize();
  const badgeBox = await badge.boundingBox();
  const scoreBox = await score.boundingBox();
  const actionsBox = await actions.boundingBox();
  const closeBox = await close.boundingBox();
  const visualBox = await page.locator('.result-visual').boundingBox();
  expect(viewport && badgeBox && scoreBox && actionsBox && closeBox && visualBox).toBeTruthy();
  expect(Math.abs(visualBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualBox.y)).toBeLessThanOrEqual(1);
  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height - 1);

  const scoreStyle = await score.evaluate((node) => {
    const style = getComputedStyle(node);
    const parentStyle = getComputedStyle(node.parentElement);
    return {
      position: style.position,
      top: style.top,
      right: style.right,
      left: style.left,
      borderTopLeftRadius: Number.parseFloat(style.borderTopLeftRadius),
      parentGridColumns: parentStyle.gridTemplateColumns.split(/\s+/).filter(Boolean)
    };
  });

  expect(scoreBox.x).toBeGreaterThanOrEqual(10);
  expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(viewport.width - 10 + 1);
  expect(scoreBox.width).toBeGreaterThanOrEqual(viewport.width * 0.88);
  expect(Math.abs(scoreBox.x + scoreBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(scoreStyle.parentGridColumns).toHaveLength(1);
  expect(scoreStyle.position).toBe('relative');
  expect(['auto', '0px']).toContain(scoreStyle.top);
  expect(['auto', '0px']).toContain(scoreStyle.right);
  expect(['auto', '0px']).toContain(scoreStyle.left);
  expect(scoreStyle.borderTopLeftRadius).toBeLessThanOrEqual(40);
  expect(badgeBox.y + badgeBox.height).toBeLessThan(scoreBox.y);
  expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: false });
});

test('v100 poster retires legacy result-in-frame before it can reclaim the real iPhone layout', async ({ page }, testInfo) => {
  await openDeterministicResult(page);

  await page.evaluate(() => {
    document.body.classList.add('result-in-frame');
    window.SmazkaResultPoster?.sync();
  });
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('result-in-frame'))).toBe(false);

  const visual = page.locator('.result-visual');
  const viewport = page.viewportSize();
  const visualBox = await visual.boundingBox();
  expect(viewport && visualBox).toBeTruthy();

  const layout = await page.evaluate(() => {
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
      contentColumns: contentStyle.gridTemplateColumns.split(/\s+/).filter(Boolean),
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
});
