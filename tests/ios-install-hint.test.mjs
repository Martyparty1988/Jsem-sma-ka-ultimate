import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('iOS install hint covers iPhone and iPad, excludes standalone mode and persists dismissal locally', () => {
  const app = readRoot('app.js');
  const css = readRoot('screens.css');

  assert.match(app, /const IOS_INSTALL_HINT_DISMISSED_KEY = 'smazka:ios-install-hint-dismissed:v1'/);
  assert.match(app, /function isIosBrowser\(\)/);
  assert.match(app, /iPad\|iPhone\|iPod/);
  assert.match(app, /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/);
  assert.match(app, /\(display-mode: standalone\)/);
  assert.match(app, /navigator\.standalone === true/);
  assert.match(app, /Sdílet → „Přidat na plochu“/);
  assert.match(app, /localStorage\.setItem\(IOS_INSTALL_HINT_DISMISSED_KEY, 'true'\)/);
  assert.match(app, /hint\.remove\(\)/);
  assert.match(css, /\.ios-install-dismiss[\s\S]{0,220}min-height:\s*44px/);
});
