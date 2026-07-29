import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../face-landmark-bridge-v81.js', import.meta.url), 'utf8');

class MockFaceMesh {
  onResults(callback) {
    this.callback = callback;
  }
}

test('landmark bridge publishes MediaPipe results without replacing the app callback', () => {
  let now = 100;
  const context = {
    console,
    performance: { now: () => ++now },
    Set,
    WeakMap,
    Object,
    Array,
    window: { FaceMesh: MockFaceMesh }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  const detector = new context.window.FaceMesh();
  let appCalls = 0;
  let feedCalls = 0;
  context.window.SmazkaLandmarkFeed.subscribe(() => { feedCalls += 1; });
  detector.onResults(() => { appCalls += 1; });

  const landmarks = Array.from({ length: 468 }, (_, index) => ({ x: index / 468, y: 0.5, z: 0 }));
  detector.callback({ multiFaceLandmarks: [landmarks] });

  const snapshot = context.window.SmazkaLandmarkFeed.getSnapshot();
  assert.equal(appCalls, 1);
  assert.equal(feedCalls, 1);
  assert.equal(snapshot.landmarks, landmarks);
  assert.equal(snapshot.faceCount, 1);
  assert.equal(snapshot.sequence, 1);
});
