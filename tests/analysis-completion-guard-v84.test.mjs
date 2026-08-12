import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

test('v110 completion guard leaves slow face-warp rendering to its single owner', () => {
  const runtime = readBundleSection('analysis-completion-guard-v84.js');

  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /const ANALYSIS_TIMEOUT_MS = 7200/);
  assert.match(runtime, /const REVEAL_TIMEOUT_MS = 1450/);
  assert.doesNotMatch(runtime, /WARP_TIMEOUT_MS|timeout-fallback-v84/);
  assert.doesNotMatch(runtime, /Promise\.race\(|patchFaceWarp|SmazkaFaceWarp/);
  assert.match(runtime, /revealClasses\.some\(\(className\) => stage\.classList\.contains\(className\)\)/);
  assert.match(runtime, /if \(overlay && overlay\.getAttribute\('aria-hidden'\) !== 'true'\)/);
  assert.match(runtime, /stage\.classList\.remove\(\.\.\.revealClasses\)/);
});

test('v84 completion guard does not retrigger itself after the result is open', () => {
  const runtime = readBundleSection('analysis-completion-guard-v84.js');
  const observerCallbacks = [];
  let stageClassWrites = 0;
  let overlayAttributeWrites = 0;

  class Observer {
    constructor(callback) {
      observerCallbacks.push(callback);
    }

    observe() {}
    disconnect() {}
  }

  const overlay = {
    getAttribute(name) {
      return name === 'aria-hidden' ? 'true' : null;
    },
    setAttribute() {
      overlayAttributeWrites += 1;
    }
  };
  const stage = {
    classList: {
      contains() {
        return false;
      },
      remove() {
        stageClassWrites += 1;
      }
    },
    querySelector() {
      return overlay;
    }
  };
  const result = {
    open: true,
    classList: {
      contains(name) {
        return name !== 'hidden';
      }
    },
    hasAttribute(name) {
      return name === 'open';
    }
  };
  const appRoot = {
    getAttribute() {
      return 'false';
    },
    inert: true
  };
  const state = {
    isAnalyzing: false,
    responseLibrary: [],
    lastAnalysisResult: {}
  };
  const elements = {
    app: appRoot,
    result,
    cameraStage: stage,
    loading: { classList: { add() {} } }
  };
  const app = {
    state,
    elements,
    setBusy(value) {
      state.isAnalyzing = Boolean(value);
    }
  };
  const window = {
    SmazkaApp: app,
    SmazkaMutationObserver: Observer,
    MutationObserver: Observer,
    addEventListener() {},
    clearTimeout() {},
    setTimeout() {
      return 1;
    }
  };
  const document = {
    body: {
      classList: {
        contains(name) {
          return name === 'result-open';
        }
      }
    }
  };
  const context = {
    window,
    document,
    console,
    CustomEvent: class {},
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    Promise
  };
  context.globalThis = context;

  vm.runInNewContext(runtime, context);
  assert.equal(observerCallbacks.length, 1);
  assert.equal(stageClassWrites, 0);
  assert.equal(overlayAttributeWrites, 0);

  observerCallbacks[0]([]);
  assert.equal(stageClassWrites, 0);
  assert.equal(overlayAttributeWrites, 0);
});

test('v84 recovers the already selected verdict instead of inventing a new result', () => {
  const runtime = readBundleSection('analysis-completion-guard-v84.js');

  assert.match(runtime, /selection\?\.responseId/);
  assert.match(runtime, /item\?\.id === selection\.responseId/);
  assert.match(runtime, /item\?\.category === selection\.category/);
  assert.match(runtime, /state\.effectImageData \|\| state\.currentImageData/);
  assert.match(runtime, /state\.lastAnalysisResult = \{/);
  assert.match(runtime, /visual\.dataset\.analysisRecovery = 'v84'/);
  assert.match(runtime, /shareButton\.id = 'shareResultButton'/);
  assert.match(runtime, /newScanButton\.addEventListener/);
  assert.match(runtime, /smazka:analysis-guard-recovered/);
  assert.doesNotMatch(runtime, /Math\.random/);
});

test('v84 removes the obsolete reveal presentation and keeps v82 as final transition owner', () => {
  const css = readRoot('screens.css');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  assert.match(css, /\.result-reveal-overlay/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /\.video-container\.is-revealing-result::before/);
  assert.match(css, /content:\s*none\s*!important/);

  const cropRuntime = lifecycle.indexOf('/* === face-aware-crop-runtime.js === */');
  const guard = lifecycle.indexOf('/* === analysis-completion-guard-v84.js === */');
  const singlePass = lifecycle.indexOf('/* === single-pass-result-v76.js === */');
  const impact = lifecycle.indexOf('/* === critical-impact-reveal-v82.js === */');
  assert.ok(guard > cropRuntime);
  assert.ok(singlePass > guard);
  assert.ok(impact > singlePass);

  assert.match(serviceWorker, /const CACHE_VERSION = 'v116'/);
  assert.match(serviceWorker, /\.\/lifecycle-runtime\.js\?v=115/);
  assert.match(serviceWorker, /\.\/result-poster-runtime\.js\?v=101/);
});
