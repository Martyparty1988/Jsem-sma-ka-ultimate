import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function removeSectionRange(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Nelze vyříznout sekce ${startMarker} → ${endMarker}`);
  }
  return `${source.slice(0, start)}${source.slice(end)}`;
}

let lifecycle = read('lifecycle-runtime.js');
lifecycle = removeSectionRange(
  lifecycle,
  '/* === pwa-update-fix.js === */',
  '/* === privacy-hardening.js === */'
);
lifecycle = removeSectionRange(
  lifecycle,
  '/* === result-frame-geometry.js === */',
  '/* === face-aware-crop-runtime.js === */'
);
write('lifecycle-runtime.js', lifecycle);

let bundleSource = read('tests/bundle-source.mjs');
bundleSource = bundleSource
  .split('\n')
  .filter((line) => ![
    "'pwa-update-fix.js',",
    "'result-frame-geometry.js',",
    "'in-frame-result.js',"
  ].some((entry) => line.includes(entry)))
  .join('\n');
write('tests/bundle-source.mjs', bundleSource);

const replaceInFile = (file, replacements) => {
  let content = read(file);
  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });
  write(file, content);
};

replaceInFile('result-poster.css', [
  [/Smažka v90/g, 'Smažka v91'],
  [/result-poster-v90/g, 'result-poster-v91']
]);
replaceInFile('index.html', [
  [/result-poster\.css\?v=90/g, 'result-poster.css?v=91'],
  [/result-poster-runtime\.js\?v=90/g, 'result-poster-runtime.js?v=91']
]);
replaceInFile('service-worker.js', [
  [/CACHE_VERSION = 'v90'/g, "CACHE_VERSION = 'v91'"],
  [/update-state-v90/g, 'update-state-v91'],
  [/result-poster\.css\?v=90/g, 'result-poster.css?v=91'],
  [/result-poster-runtime\.js\?v=90/g, 'result-poster-runtime.js?v=91']
]);

for (const entry of fs.readdirSync(path.join(root, 'tests'))) {
  if (!entry.endsWith('.test.mjs')) continue;
  const file = path.join('tests', entry);
  let content = read(file)
    .replaceAll('v90', 'v91')
    .replaceAll('v=90', 'v=91')
    .replaceAll('version: 90', 'version: 91')
    .replace(/^.*LEGACY_SETTLE_DELAYS.*\n/gm, '')
    .replace(/^.*data-result-layout.*\n/gm, '');
  write(file, content);
}

const retiredGeometryTest = path.join(root, 'tests/result-frame-geometry.test.mjs');
if (fs.existsSync(retiredGeometryTest)) fs.rmSync(retiredGeometryTest);

const oldUpdateTest = path.join(root, 'tests/pwa-update-delivery-v90.test.mjs');
const newUpdateTest = path.join(root, 'tests/pwa-update-delivery-v91.test.mjs');
if (fs.existsSync(oldUpdateTest)) fs.renameSync(oldUpdateTest, newUpdateTest);

console.log('Lifecycle v91 pruned: pwa-update-fix, result-frame-geometry and in-frame-result removed.');