from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "tests/e2e/mobile-result.spec.mjs"
TARGET.parent.mkdir(parents=True, exist_ok=True)

TARGET.write_text(r'''import { test, expect } from '@playwright/test';

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

  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: false });
});
''', encoding='utf-8')

print('Rewrote the generated WebKit fixture without nested template literals.')
