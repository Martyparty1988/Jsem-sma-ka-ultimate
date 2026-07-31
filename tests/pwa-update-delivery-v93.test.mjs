import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('installed PWA updates activate automatically and reload existing clients once', () => {
  const serviceWorker = readRoot('service-worker.js');

  assert.match(serviceWorker, /const UPDATE_STATE_KEY = '\.\/__smazka-update-state-v100'/);
  assert.match(serviceWorker, /const isUpdate = Boolean\(self\.registration\.active\)/);
  assert.match(serviceWorker, /cache\.put\(UPDATE_STATE_KEY, new Response\(isUpdate \? 'reload' : 'first-install'\)\)/);
  assert.match(serviceWorker, /await self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /const shouldReloadClients = \(await updateState\?\.text\(\)\) === 'reload'/);
  assert.match(serviceWorker, /await self\.clients\.claim\(\)/);
  assert.match(serviceWorker, /self\.clients\.matchAll\(\{/);
  assert.match(serviceWorker, /includeUncontrolled: true/);
  assert.match(serviceWorker, /await client\.navigate\(url\.href\)/);
  assert.doesNotMatch(serviceWorker, /SKIP_WAITING/);
});

test('first installation does not force a client reload', () => {
  const serviceWorker = readRoot('service-worker.js');

  assert.match(serviceWorker, /if \(!shouldReloadClients\) return/);
  assert.match(serviceWorker, /isUpdate \? 'reload' : 'first-install'/);
});
