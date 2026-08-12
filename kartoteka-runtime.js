/* Local-only scan history. Records never contain images, landmarks or biometric payloads. */
(() => {
  'use strict';

  const STORAGE_KEY = 'smazka:kartoteka:v1';
  const MAX_RECORDS = 50;

  function clampSeverity(value) {
    const severity = Number(value);
    if (!Number.isFinite(severity)) return 0;
    return Math.max(0, Math.min(100, Math.round(severity)));
  }

  function toIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function normaliseRecord(record) {
    if (!record || typeof record !== 'object') return null;

    const title = String(record.title || '').trim().slice(0, 180);
    if (!title) return null;

    return Object.freeze({
      title,
      severity: clampSeverity(record.severity),
      date: toIsoDate(record.date)
    });
  }

  function read(storage = globalThis.localStorage) {
    try {
      const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normaliseRecord).filter(Boolean).slice(-MAX_RECORDS);
    } catch {
      return [];
    }
  }

  function write(records, storage = globalThis.localStorage) {
    const safeRecords = Array.isArray(records)
      ? records.map(normaliseRecord).filter(Boolean).slice(-MAX_RECORDS)
      : [];

    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(safeRecords));
    } catch {
      // Private mode or a full local store must not block the verdict.
    }

    return safeRecords;
  }

  function add(record, storage = globalThis.localStorage) {
    const safeRecord = normaliseRecord(record);
    if (!safeRecord) return read(storage);
    return write([...read(storage), safeRecord], storage);
  }

  function dayKey(value) {
    return toIsoDate(value).slice(0, 10);
  }

  function getDayStreak(records, now = new Date()) {
    const scannedDays = new Set(records.map((record) => dayKey(record.date)));
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let streak = 0;

    while (scannedDays.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return streak;
  }

  function getStreakTitle(streak) {
    if (streak >= 7) return 'institucionální inventář';
    if (streak >= 3) return 'recidivista';
    if (streak >= 2) return 'opakovaný případ';
    if (streak === 1) return 'čerstvý spis';
    return 'svědek bez záznamu';
  }

  function getSummary(records, now = new Date()) {
    const safeRecords = Array.isArray(records) ? records.map(normaliseRecord).filter(Boolean) : [];
    const streak = getDayStreak(safeRecords, now);
    return Object.freeze({
      total: safeRecords.length,
      personalLow: safeRecords.reduce((maximum, record) => Math.max(maximum, record.severity), 0),
      streak,
      streakTitle: getStreakTitle(streak)
    });
  }

  globalThis.SmazkaKartoteka = Object.freeze({
    STORAGE_KEY,
    MAX_RECORDS,
    add,
    read,
    write,
    getSummary,
    getDayStreak,
    getStreakTitle
  });
})();
