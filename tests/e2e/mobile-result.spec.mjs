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
    const faceAnalysis = {
      schemaVersion: 4,
      sourceKind: 'upload',
      normalizedLandmarks: Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
      metrics: {
        apertura: 50,
        lidskost: 50,
        gravitace: 10,
        asymetrie: 'střední',
        hydratace: 50
      },
      signals: {
        pose: 0.4,
        eyes: 0.5,
        mouth: 0.3,
        asymmetry: 0.4,
        stability: null,
        exposure: 0.2,
        sharpness: 0.3
      },
      scores: { severity: 61 }
    };
    window.SmazkaApp.setCurrentImageData(image);
    window.SmazkaApp.runAnalysis({
      skipImageCheck: true,
      faceAnalysis
    });
  }, photo);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });
}

test('mobile result keeps the visible detail control and compact action dock inside the viewport', async ({ page }, testInfo) => {
  await openDeterministicResult(page);

  const badge = page.locator('.result-badge');
  const score = page.locator('.effect-label.result-score');
  const scoreValue = score.locator('strong');
  const description = page.locator('.description');
  const details = page.locator('.in-frame-details-toggle');
  const actions = page.locator('.result-actions');
  const share = page.locator('.share-button');
  const destroy = page.locator('.destroy-more-button');
  const retry = page.locator('.new-scan-button');
  const close = page.locator('.result-close');

  await expect(badge).toHaveText('SMAŽKA FAKTOR');
  await expect(scoreValue).toHaveText(/^(?:100|[1-9]?\d)%$/);
  await expect(details).toBeVisible();
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(details.locator('.in-frame-details-label')).toHaveText('Otevřít protokol smažky');
  await expect(destroy).toBeVisible();
  expect(await score.evaluate((node) => node.parentElement?.classList.contains('result-content'))).toBe(true);

  const viewport = page.viewportSize();
  const badgeBox = await badge.boundingBox();
  const scoreBox = await score.boundingBox();
  const descriptionBox = await description.boundingBox();
  const detailsBox = await details.boundingBox();
  const actionsBox = await actions.boundingBox();
  const shareBox = await share.boundingBox();
  const destroyBox = await destroy.boundingBox();
  const retryBox = await retry.boundingBox();
  const closeBox = await close.boundingBox();
  const visualBox = await page.locator('.result-visual').boundingBox();
  expect(viewport && badgeBox && scoreBox && descriptionBox && detailsBox && actionsBox && shareBox && destroyBox && retryBox && closeBox && visualBox).toBeTruthy();
  expect(Math.abs(visualBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualBox.y)).toBeLessThanOrEqual(1);
  expect(visualBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height * 0.35);
  expect(visualBox.height).toBeLessThan(viewport.height * 0.7);
  expect(visualBox.y + visualBox.height).toBeLessThanOrEqual(scoreBox.y + 1);

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
  expect(detailsBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
  expect(detailsBox.y + detailsBox.height).toBeLessThanOrEqual(actionsBox.y + 1);
  expect(detailsBox.height).toBeGreaterThanOrEqual(44);
  expect(shareBox.y).toBeLessThan(destroyBox.y);
  expect(Math.abs(destroyBox.y - retryBox.y)).toBeLessThanOrEqual(1);
  expect(destroyBox.x + destroyBox.width).toBeLessThanOrEqual(retryBox.x + 1);
  expect(shareBox.height).toBeGreaterThanOrEqual(44);
  expect(destroyBox.height).toBeGreaterThanOrEqual(44);
  expect(retryBox.height).toBeGreaterThanOrEqual(44);
  expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);

  const actionColumns = await actions.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean));
  expect(actionColumns).toHaveLength(2);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: false });

  await details.click();
  await expect(page.locator('#result')).toHaveClass(/details-open/);
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(details.locator('.in-frame-details-label')).toHaveText('Skrýt protokol smažky');
  const diagnosticPanel = page.locator('.diagnostic-panel');
  await expect(diagnosticPanel).toBeVisible();
  await expect(diagnosticPanel.locator('.diagnostic-heading strong')).toHaveText('SMAŽKA PROTOKOL');
  await expect(diagnosticPanel.locator('.diagnostic-heading small')).toHaveText('toxikologie z benzínky · 0 % diagnóza');
  await expect(diagnosticPanel.getByText('Toxikologický poplach', { exact: true })).toBeVisible();
  const diagnosticGeometry = await diagnosticPanel.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    visibleRows: Array.from(node.querySelectorAll('.diagnostic-row')).filter((row) => row.getBoundingClientRect().height > 0).length
  }));
  expect(diagnosticGeometry.visibleRows).toBeGreaterThan(0);
  expect(diagnosticGeometry.clientHeight).toBeGreaterThanOrEqual(diagnosticGeometry.scrollHeight - 1);
  const toolGrid = page.locator('.result-tool-grid');
  const toolButtons = toolGrid.locator('.result-tool-button');
  const detailActions = page.locator('.result-actions');
  const toolColumns = await toolGrid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean));
  const detailActionColumns = await detailActions.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean));
  expect(toolColumns).toHaveLength(2);
  expect(detailActionColumns).toHaveLength(2);
  expect(await toolButtons.count()).toBe(3);

  const [primaryToolBox, originalToolBox, warpedToolBox] = await Promise.all([
    toolButtons.nth(0).boundingBox(),
    toolButtons.nth(1).boundingBox(),
    toolButtons.nth(2).boundingBox()
  ]);
  const [detailShareBox, detailDestroyBox, detailRetryBox] = await Promise.all([
    share.boundingBox(),
    destroy.boundingBox(),
    retry.boundingBox()
  ]);
  expect(primaryToolBox && originalToolBox && warpedToolBox && detailShareBox && detailDestroyBox && detailRetryBox).toBeTruthy();
  expect(primaryToolBox.height).toBeGreaterThanOrEqual(44);
  expect(originalToolBox.height).toBeGreaterThanOrEqual(44);
  expect(warpedToolBox.height).toBeGreaterThanOrEqual(44);
  expect(primaryToolBox.y).toBeLessThan(originalToolBox.y);
  expect(Math.abs(originalToolBox.y - warpedToolBox.y)).toBeLessThanOrEqual(1);
  expect(detailShareBox.y).toBeLessThan(detailDestroyBox.y);
  expect(Math.abs(detailDestroyBox.y - detailRetryBox.y)).toBeLessThanOrEqual(1);
  const detailOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(detailOverflow.scrollWidth).toBeLessThanOrEqual(detailOverflow.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('result-details.png'), fullPage: false });
});

test('v103 poster keeps score below the photo even if legacy result-in-frame returns', async ({ page }, testInfo) => {
  await openDeterministicResult(page);

  await page.evaluate(() => {
    document.body.classList.add('result-in-frame');
    window.SmazkaResultPoster?.sync();
  });
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('result-in-frame'))).toBe(false);

  const visual = page.locator('.result-visual');
  const score = page.locator('.effect-label.result-score');
  const viewport = page.viewportSize();
  const visualBox = await visual.boundingBox();
  const scoreBox = await score.boundingBox();
  expect(viewport && visualBox && scoreBox).toBeTruthy();

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
  expect(visualBox.height).toBeGreaterThanOrEqual(viewport.height * 0.35);
  expect(visualBox.height).toBeLessThan(viewport.height * 0.7);
  expect(visualBox.y + visualBox.height).toBeLessThanOrEqual(scoreBox.y + 1);

  await page.screenshot({ path: testInfo.outputPath('result-real-scan-state.png'), fullPage: false });
});
