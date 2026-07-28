const NUMERIC_TRIGGERS = Object.freeze({
  lidskost_min: ['lidskost', (value, limit) => value >= limit],
  lidskost_max: ['lidskost', (value, limit) => value <= limit],
  apertura_min: ['apertura', (value, limit) => value >= limit],
  apertura_max: ['apertura', (value, limit) => value <= limit],
  tilt_min: ['gravitace', (value, limit) => value >= limit],
  tilt_max: ['gravitace', (value, limit) => value <= limit]
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedAsymmetry(value) {
  return typeof value === 'string'
    ? value.trim().toLocaleLowerCase('cs-CZ')
    : '';
}

function triggerMatches(metrics, key, expected) {
  if (key === 'asymetrie') {
    const actual = normalizedAsymmetry(metrics?.asymetrie);
    const wanted = normalizedAsymmetry(expected);
    return ['nízká', 'střední', 'vysoká'].includes(wanted) && actual === wanted;
  }

  const definition = NUMERIC_TRIGGERS[key];
  if (!definition) return false;

  const [metricKey, compare] = definition;
  const value = finiteNumber(metrics?.[metricKey]);
  const limit = finiteNumber(expected);
  return value !== null && limit !== null && compare(value, limit);
}

export function scoreVerdict(metrics, verdict) {
  const triggers = verdict?.triggers;
  if (!triggers || typeof triggers !== 'object' || Array.isArray(triggers)) return 0;

  return Object.entries(triggers).reduce(
    (score, [key, expected]) => score + Number(triggerMatches(metrics, key, expected)),
    0
  );
}

function randomItem(items, random) {
  if (items.length === 1) return items[0];

  const sample = Number(random());
  const safeSample = Number.isFinite(sample)
    ? Math.max(0, Math.min(0.9999999999999999, sample))
    : 0;

  return items[Math.floor(safeSample * items.length)];
}

/**
 * Vybere verdikt podle počtu splněných triggerů.
 *
 * Třetí parametr je volitelný generátor čísla 0–1. Umožňuje deterministické
 * testy, aniž by funkce měnila vstupní metriky nebo pole verdiktů.
 */
export function matchVerdict(metrics, responses, random = Math.random) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  const candidates = responses.filter(Boolean);
  if (candidates.length === 0) return null;

  const scored = candidates.map((verdict) => ({
    verdict,
    score: scoreVerdict(metrics, verdict)
  }));
  const highestScore = scored.reduce(
    (highest, candidate) => Math.max(highest, candidate.score),
    0
  );

  if (highestScore === 0) return randomItem(candidates, random);

  const bestMatches = scored
    .filter((candidate) => candidate.score === highestScore)
    .map((candidate) => candidate.verdict);

  return randomItem(bestMatches, random);
}

export default matchVerdict;
