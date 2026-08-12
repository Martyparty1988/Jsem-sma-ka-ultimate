import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readRoot } from './bundle-source.mjs';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function loadKartoteka(storage = createStorage()) {
  const context = { localStorage: storage, Date, JSON, Math, Number, String, Array, Object, Set, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(readRoot('kartoteka-runtime.js'), context);
  return { api: context.SmazkaKartoteka, storage };
}

test('Kartotéka keeps only local verdict metadata and caps the file at fifty records', () => {
  const { api, storage } = loadKartoteka();
  const records = Array.from({ length: 52 }, (_, index) => ({
    title: `Spis ${index}`,
    severity: index,
    date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    photo: 'data:image/never-store-this',
    landmarks: [1, 2, 3]
  }));

  const saved = api.write(records, storage);
  const persisted = JSON.parse(storage.getItem(api.STORAGE_KEY));

  assert.equal(saved.length, 50);
  assert.equal(persisted.length, 50);
  assert.deepEqual(Object.keys(persisted[0]).sort(), ['date', 'severity', 'title']);
  assert.equal(persisted[0].title, 'Spis 2');
  assert.equal(persisted.at(-1).severity, 51);
});

test('Kartotéka derives personal low and consecutive-day recidivism from ISO dates', () => {
  const { api } = loadKartoteka();
  const records = [
    { title: 'Včerejší stopa', severity: 67, date: '2026-08-11T23:00:00.000Z' },
    { title: 'Předvčerejší stopa', severity: 48, date: '2026-08-10T23:00:00.000Z' },
    { title: 'Dnešní spis', severity: 92, date: '2026-08-12T23:00:00.000Z' }
  ];

  assert.deepEqual(
    { ...api.getSummary(records, new Date('2026-08-12T23:30:00.000Z')) },
    { total: 3, personalLow: 92, streak: 3, streakTitle: 'recidivista' }
  );
});
