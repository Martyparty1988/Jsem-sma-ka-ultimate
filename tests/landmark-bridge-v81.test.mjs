import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection } from './bundle-source.mjs';

const source = readBundleSection('face-landmark-bridge-v81.js');

class MockVideo {
  constructor() {
    this.videoWidth = 1280;
    this.videoHeight = 720;
  }
}

class MockFaceMesh {
  onResults(callback) {
    this.callback = callback;
  }

  send(packet) {
    this.lastPacket = packet;
    return Promise.resolve();
  }
}

test('v116 exposes one stable landmark feed before the lazy Face Mesh runtime exists', () => {
  class LazyMockFaceMesh {
    onResults(callback) {
      this.callback = callback;
    }

    send(packet) {
      this.lastPacket = packet;
      return Promise.resolve();
    }
  }

  const context = {
    console,
    performance: { now: () => 1 },
    Set,
    WeakMap,
    Object,
    Array,
    HTMLVideoElement: MockVideo,
    window: {}
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  const feed = context.window.SmazkaLandmarkFeed;
  assert.ok(feed);
  assert.equal(feed.getSnapshot().landmarks, null);
  assert.equal(context.window.SmazkaInstallLandmarkBridge(), false);

  context.window.FaceMesh = LazyMockFaceMesh;
  assert.equal(context.window.SmazkaInstallLandmarkBridge(), true);
  assert.equal(context.window.SmazkaLandmarkFeed, feed);
});

test('landmark bridge publishes MediaPipe results without replacing the app callback', async () => {
  let now = 100;
  const context = {
    console,
    performance: { now: () => ++now },
    Set,
    WeakMap,
    Object,
    Array,
    HTMLVideoElement: MockVideo,
    window: { FaceMesh: MockFaceMesh }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  const detector = new context.window.FaceMesh();
  let appCalls = 0;
  let feedCalls = 0;
  context.window.SmazkaLandmarkFeed.subscribe(() => { feedCalls += 1; });
  detector.onResults(() => { appCalls += 1; });
  await detector.send({ image: new MockVideo() });

  const landmarks = Array.from({ length: 468 }, (_, index) => ({ x: index / 468, y: 0.5, z: 0 }));
  detector.callback({ multiFaceLandmarks: [landmarks] });

  const snapshot = context.window.SmazkaLandmarkFeed.getSnapshot();
  assert.equal(appCalls, 1);
  assert.equal(feedCalls, 1);
  assert.equal(snapshot.landmarks, landmarks);
  assert.equal(snapshot.faceCount, 1);
  assert.equal(snapshot.sequence, 1);
  assert.equal(snapshot.sourceKind, 'video');
  assert.equal(snapshot.sourceWidth, 1280);
  assert.equal(snapshot.sourceHeight, 720);
});
