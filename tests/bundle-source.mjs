import fs from 'node:fs';

const root = new URL('../', import.meta.url);

const bundleBySource = new Map([
  ...[
    'legacy-share-bypass-v79.js',
    'face-aware-crop.js',
    'face-input-optimizer-v80.js',
    'face-landmark-bridge-v81.js',
    'hud-junkie-themes.js',
    'face-scan.js',
    'junkie-vision-hud-v81.js',
    'junkie-vision-balance-v83.js'
  ].map((source) => [source, 'scanner-runtime.js']),
  ...[
    'face-warp.js',
    'hard-responses.js',
    'junky-verdict-engine.js',
    'experience-upgrades.js',
    'diagnostic-upgrades.js'
  ].map((source) => [source, 'result-runtime.js']),
  ...[
    'privacy-hardening.js',
    'ios-one-screen.js',
    'face-aware-crop-runtime.js',
    'analysis-state-stability-v84.js',
    'analysis-completion-guard-v84.js',
    'analysis-rescue-v85.js',
    'single-pass-result-v76.js',
    'critical-impact-reveal-v82.js',
    'scanner-focus.js',
    'face-guidance.js',
    'share-cover-v77.js',
    'result-intensity.js',
    'junkie-polish-v55.js',
    'boot-message-v54.js',
    'result-close-reset-v58.js'
  ].map((source) => [source, 'lifecycle-runtime.js'])
]);

export function readRoot(file) {
  return fs.readFileSync(new URL(file, root), 'utf8');
}

export function readBundleSection(source) {
  const bundle = bundleBySource.get(source);
  if (!bundle) throw new Error(`Neznámá runtime sekce: ${source}`);

  const contents = readRoot(bundle);
  const marker = `/* === ${source} === */`;
  const start = contents.indexOf(marker);
  if (start < 0) throw new Error(`Sekce ${source} chybí v ${bundle}`);

  const bodyStart = start + marker.length;
  const next = contents.indexOf('\n/* === ', bodyStart);
  return contents.slice(bodyStart, next < 0 ? contents.length : next).trim();
}
