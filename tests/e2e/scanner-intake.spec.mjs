import { test, expect } from '@playwright/test';

test('v121 local intake keeps brand, specimen guidance and controls inside the iPhone viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.SmazkaApp
      && document.body.classList.contains('ios-one-screen-ready')
  ));

  const brand = page.locator('.brand-lockup');
  const brandCopy = brand.locator('.brand-copy');
  const idle = page.locator('#cameraIdle');
  const stage = page.locator('#cameraStage');
  const hint = page.locator('#scanHint');
  const controls = page.locator('.button-group');
  const upload = page.locator('#uploadButton');
  const analyze = page.locator('#analyzeButton');
  const privacy = page.locator('.privacy-strip');

  await expect(brandCopy.locator('strong')).toHaveText('SMAŽKA');
  await expect(brandCopy.locator('small')).toHaveText('LOKÁLNÍ FACE LAB');
  await expect(idle.locator('.idle-protocol')).toHaveText('PŘÍJEM VZORKU · LOKÁLNĚ');
  await expect(idle.locator('.idle-title')).toHaveText('Čekám na obličej');
  await expect(idle.locator('.idle-copy')).toHaveText('Kamera se otevře až po klepnutí');
  await expect(idle.locator('.idle-local')).toContainText('0 % upload');
  await expect(upload).toBeVisible();
  await expect(analyze).toBeVisible();
  await expect(privacy).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
        centerX: box.left + box.width / 2,
        centerY: box.top + box.height / 2
      } : null;
    };

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      },
      brand: rect('.brand-lockup'),
      tools: rect('.topbar-tools'),
      stage: rect('#cameraStage'),
      idle: rect('#cameraIdle'),
      hint: rect('#scanHint'),
      controls: rect('.button-group'),
      upload: rect('#uploadButton'),
      analyze: rect('#analyzeButton'),
      privacy: rect('.privacy-strip')
    };
  });

  expect(geometry.document.scrollWidth).toBeLessThanOrEqual(geometry.document.clientWidth + 1);
  expect(geometry.document.scrollHeight).toBeLessThanOrEqual(geometry.document.clientHeight + 1);
  expect(geometry.brand && geometry.tools && geometry.stage && geometry.idle).toBeTruthy();
  expect(geometry.hint && geometry.controls && geometry.upload && geometry.analyze && geometry.privacy).toBeTruthy();
  expect(geometry.brand.right).toBeLessThanOrEqual(geometry.tools.left + 1);
  expect(geometry.stage.left).toBeGreaterThanOrEqual(8);
  expect(geometry.stage.right).toBeLessThanOrEqual(geometry.viewport.width - 8);
  expect(geometry.stage.height).toBeGreaterThan(300);
  expect(Math.abs(geometry.idle.centerX - geometry.stage.centerX)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.idle.centerY - geometry.stage.centerY)).toBeLessThanOrEqual(1);
  expect(geometry.stage.bottom).toBeLessThanOrEqual(geometry.hint.top + 1);
  expect(geometry.hint.bottom).toBeLessThanOrEqual(geometry.controls.top + 1);
  expect(geometry.controls.bottom).toBeLessThanOrEqual(geometry.privacy.top + 1);
  expect(geometry.privacy.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  expect(geometry.upload.height).toBeGreaterThanOrEqual(44);
  expect(geometry.analyze.height).toBeGreaterThanOrEqual(44);

  await page.screenshot({ path: testInfo.outputPath('scanner-intake-v121.png'), fullPage: false });
});
