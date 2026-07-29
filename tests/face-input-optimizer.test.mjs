import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../face-input-optimizer-v80.js', import.meta.url), 'utf8');

class MockVideo {
  constructor() {
    this.videoWidth = 1280;
    this.videoHeight = 720;
    this.currentTime = 1;
  }
}

class MockFaceMesh {
  constructor() {
    this.calls = [];
  }

  send(packet) {
    this.calls.push(packet);
    return Promise.resolve({ packet });
  }
}

function createHarness() {
  const buffers = [];
  const listeners = new Map();
  const classes = new Set();
  let now = 0;

  const document = {
    body: {
      classList: {
        contains(name) {
          return classes.has(name);
        }
      }
    },
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const context = {
        drawCalls: [],
        drawImage(...args) {
          this.drawCalls.push(args);
        }
      };
      const canvas = {
        width: 1,
        height: 1,
        dataset: {},
        getContext(type) {
          assert.equal(type, '2d');
          return context;
        },
        context
      };
      buffers.push(canvas);
      return canvas;
    }
  };

  const window = {
    FaceMesh: MockFaceMesh,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    }
  };

  const context = {
    console,
    document,
    window,
    HTMLVideoElement: MockVideo,
    performance: {
      now() {
        now += 0.25;
        return now;
      }
    },
    Promise,
    Uint8ClampedArray,
    WeakMap,
    Set,
    Object,
    Number,
    Math
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  return { buffers, classes, listeners, window };
}

test('live video is resized proportionally, duplicate frames are skipped and still images pass through', async () => {
  const harness = createHarness();
  const detector = new harness.window.FaceMesh();
  const video = new MockVideo();

  await detector.send({ image: video, tag: 'idle' });
  assert.equal(detector.calls.length, 1);
  const idleCanvas = detector.calls[0].image;
  assert.equal(idleCanvas.width, 512);
  assert.equal(idleCanvas.height, 288);
  assert.equal(idleCanvas.context.drawCalls.length, 1);
  assert.equal(detector.calls[0].tag, 'idle');

  await detector.send({ image: video, tag: 'duplicate' });
  assert.equal(detector.calls.length, 1, 'same video timestamp must not enter MediaPipe twice');

  harness.classes.add('face-scan-active');
  video.currentTime = 1.1;
  await detector.send({ image: video, tag: 'scan' });
  assert.equal(detector.calls.length, 2);
  assert.equal(detector.calls[1].image.width, 640);
  assert.equal(detector.calls[1].image.height, 360);

  const stillImage = { naturalWidth: 1600, naturalHeight: 1200 };
  await detector.send({ image: stillImage, tag: 'still' });
  assert.equal(detector.calls.length, 3);
  assert.equal(detector.calls[2].image, stillImage, 'uploaded still images must keep their original input');

  const stats = harness.window.SmazkaFaceInputOptimizer.getStats();
  assert.equal(stats.preparedFrames, 2);
  assert.equal(stats.duplicateFrames, 1);
  assert.equal(stats.bypassedFrames, 1);
  assert.equal(stats.idleMaxEdge, 512);
  assert.equal(stats.scanMaxEdge, 640);

  harness.listeners.get('pagehide')?.();
  assert.equal(harness.buffers[0].width, 1);
  assert.equal(harness.buffers[0].height, 1);
});
