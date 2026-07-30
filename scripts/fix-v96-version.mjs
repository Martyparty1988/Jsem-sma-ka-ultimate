import fs from 'node:fs';

function replace(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Missing target in ${path}: ${from}`);
  fs.writeFileSync(path, source.replace(from, to));
}

replace(
  'result-poster-runtime.js',
  'window.SmazkaResultPoster = Object.freeze({ version: 95, sync: scheduleSync });',
  'window.SmazkaResultPoster = Object.freeze({ version: 96, sync: scheduleSync });'
);
replace(
  'tests/pwa-cache.test.mjs',
  'window\\.SmazkaResultPoster = Object\\.freeze\\(\\{ version: 95',
  'window\\.SmazkaResultPoster = Object\\.freeze\\(\\{ version: 96'
);

fs.writeFileSync('.github/workflows/tests.yml', `name: Regression tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run test suite
        run: node --test tests/*.test.mjs
`);
fs.unlinkSync('scripts/fix-v96-version.mjs');
