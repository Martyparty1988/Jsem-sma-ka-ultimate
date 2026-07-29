import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('result-frame-geometry.js', root), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const geometry = context.SmazkaResultFrameGeometry;

function assertFrame(viewport, expected) {
  const frame = geometry.calculateResultFrame(viewport);
  assert.deepEqual(
    JSON.parse(JSON.stringify(frame)),
    expected
  );
  assert.equal(geometry.frameFitsViewport(frame, viewport), true);
}

test('iPhone SE viewport keeps a six-pixel frame inside every edge', () => {
  assertFrame(
    { width: 375, height: 667, offsetTop: 0, offsetLeft: 0, gap: 6 },
    { top: 6, left: 6, width: 363, height: 655, right: 369, bottom: 661, gap: 6 }
  );
});

test('modern iPhone viewport remains full height without crossing the safe viewport', () => {
  assertFrame(
    { width: 393, height: 852, offsetTop: 0, offsetLeft: 0, gap: 6 },
    { top: 6, left: 6, width: 381, height: 840, right: 387, bottom: 846, gap: 6 }
  );
});

test('Safari visualViewport offsets are respected when browser chrome moves', () => {
  assertFrame(
    { width: 390, height: 701, offsetTop: 47, offsetLeft: 0, gap: 6 },
    { top: 53, left: 6, width: 378, height: 689, right: 384, bottom: 742, gap: 6 }
  );
});

test('landscape and malformed values never create negative frame dimensions', () => {
  const landscape = geometry.calculateResultFrame({
    width: 844,
    height: 390,
    offsetTop: 0,
    offsetLeft: 0,
    gap: 6
  });
  assert.equal(geometry.frameFitsViewport(landscape, { width: 844, height: 390 }), true);
  assert.equal(landscape.width, 832);
  assert.equal(landscape.height, 378);

  const malformed = geometry.calculateResultFrame({
    width: -20,
    height: Number.NaN,
    offsetTop: Number.NaN,
    offsetLeft: Number.NaN,
    gap: -8
  });
  assert.equal(malformed.top, 0);
  assert.equal(malformed.left, 0);
  assert.equal(malformed.width, 1);
  assert.equal(malformed.height, 1);
});
