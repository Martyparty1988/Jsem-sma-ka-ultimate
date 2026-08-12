import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.FaceMesh = class MockFaceMesh {
      onResults(callback) {
        this.callback = callback;
      }

      send(packet) {
        this.lastPacket = packet;
        return Promise.resolve();
      }
    };
  });
});

test('v116 scan renders one local SMAŽKA specimen protocol from real landmark count', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.SmazkaApp
      && window.SmazkaLandmarkFeed
      && window.SmazkaJunkieVision
  ));

  await page.evaluate(async () => {
    const detector = new window.FaceMesh();
    detector.onResults(() => undefined);
    await detector.send({ image: { width: 640, height: 480 } });
    detector.callback({
      multiFaceLandmarks: [Array.from({ length: 478 }, (_, index) => ({
        x: 0.34 + (index % 22) / 70,
        y: 0.2 + (index % 29) / 52,
        z: 0
      }))]
    });
    document.body.classList.add('face-scan-active');
    window.SmazkaJunkieVision.start();
  });

  const hud = page.locator('#junkieVisionHud');
  const stage = hud.locator('.jvh-stage-label');
  const pointCount = hud.locator('.jvh-score strong');

  await expect(hud).toBeVisible();
  await expect(stage).toHaveText('PŘÍJEM VZORKU // LOKÁLNÍ');
  await expect(hud.locator('.jvh-score small')).toHaveText('MAPA TVÁŘE');
  await expect(pointCount).toHaveText('478');
  await expect(hud.locator('.jvh-score span')).toHaveText('BODŮ');
  await expect(hud.locator('.jvh-footer')).toHaveText('SMAŽKA LAB // SATIRA, NE DIAGNÓZA');

  await expect(stage).toHaveText('TOXIKOLOGICKÝ PRŮCHOD // 0 % DIAGNÓZA', { timeout: 2_000 });
  await expect(hud.locator('.jvh-metric-row').first()).not.toHaveClass(/is-empty/);
  await expect(stage).toHaveText('VZOREK UZAVŘEN // TISKNU PROTOKOL', { timeout: 2_500 });
  await expect(hud.locator('.jvh-critical')).toContainText('VZOREK UZAVŘEN');

  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const target = document.querySelector('#junkieVisionHud');
    const score = target?.querySelector('.jvh-score');
    const system = target?.querySelector('.jvh-system');
    const targetRect = target?.getBoundingClientRect();
    const scoreRect = score?.getBoundingClientRect();
    const systemRect = system?.getBoundingClientRect();
    return {
      overflow: root.scrollWidth - root.clientWidth,
      target: targetRect ? { width: targetRect.width, height: targetRect.height } : null,
      score: scoreRect ? { left: scoreRect.left, right: scoreRect.right } : null,
      system: systemRect ? { left: systemRect.left, right: systemRect.right } : null
    };
  });

  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.target?.width).toBeGreaterThan(280);
  expect(geometry.target?.height).toBeGreaterThan(260);
  expect(geometry.system?.right).toBeLessThanOrEqual(geometry.score?.left + 1);
  await page.screenshot({ path: testInfo.outputPath('scan-protocol-v116.png'), fullPage: false });
});
