const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1)
  };
}

function distance(first, second) {
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

function midpoint(first, second, weight = 0.5) {
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return {
    x: first.x + (second.x - first.x) * weight,
    y: first.y + (second.y - first.y) * weight
  };
}

function region(center, radiusX, radiusY) {
  return [
    clamp(finite(center?.x, 0.5), -0.2, 1.2),
    clamp(finite(center?.y, 0.5), -0.2, 1.2),
    clamp(Math.abs(finite(radiusX, 0.1)), 0.008, 0.58),
    clamp(Math.abs(finite(radiusY, 0.1)), 0.008, 0.58)
  ];
}

export function createCoverTransform({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight
}) {
  const safeSourceWidth = Math.max(1, finite(sourceWidth, 1));
  const safeSourceHeight = Math.max(1, finite(sourceHeight, 1));
  const safeTargetWidth = Math.max(1, finite(targetWidth, 1));
  const safeTargetHeight = Math.max(1, finite(targetHeight, 1));
  const scale = Math.max(
    safeTargetWidth / safeSourceWidth,
    safeTargetHeight / safeSourceHeight
  );
  const offsetX = (safeTargetWidth - safeSourceWidth * scale) / 2;
  const offsetY = (safeTargetHeight - safeSourceHeight * scale) / 2;

  return {
    scale,
    offsetX,
    offsetY,
    sourceWidth: safeSourceWidth,
    sourceHeight: safeSourceHeight,
    targetWidth: safeTargetWidth,
    targetHeight: safeTargetHeight,
    mapPoint(value) {
      const normalized = point(value);
      if (!normalized) return null;
      return {
        x: (normalized.x * safeSourceWidth * scale + offsetX) / safeTargetWidth,
        y: (normalized.y * safeSourceHeight * scale + offsetY) / safeTargetHeight
      };
    }
  };
}

export function defaultWarpGeometry() {
  return {
    anchored: false,
    face: [0.5, 0.48, 0.355, 0.39],
    forehead: [0.5, 0.285, 0.235, 0.17],
    leftEye: [0.39, 0.405, 0.095, 0.052],
    rightEye: [0.61, 0.405, 0.095, 0.052],
    leftCheek: [0.365, 0.51, 0.19, 0.19],
    rightCheek: [0.635, 0.51, 0.19, 0.19],
    mouth: [0.5, 0.62, 0.15, 0.075],
    jaw: [0.5, 0.69, 0.265, 0.185],
    crop: null
  };
}

function validBounds(bounds) {
  return Boolean(
    bounds
    && Number.isFinite(Number(bounds.x))
    && Number.isFinite(Number(bounds.y))
    && Number.isFinite(Number(bounds.width))
    && Number.isFinite(Number(bounds.height))
    && Number(bounds.width) >= 0.04
    && Number(bounds.height) >= 0.06
  );
}

export function createWarpGeometry({
  faceAnalysis,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight
}) {
  const anchors = faceAnalysis?.anchors;
  const bounds = faceAnalysis?.faceBounds;
  if (!anchors || !validBounds(bounds)) return defaultWarpGeometry();

  const transform = createCoverTransform({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight
  });
  const map = (value) => transform.mapPoint(point(value));
  const topLeft = map({ x: bounds.x, y: bounds.y });
  const bottomRight = map({
    x: Number(bounds.x) + Number(bounds.width),
    y: Number(bounds.y) + Number(bounds.height)
  });
  if (!topLeft || !bottomRight) return defaultWarpGeometry();

  const faceWidth = Math.abs(bottomRight.x - topLeft.x);
  const faceHeight = Math.abs(bottomRight.y - topLeft.y);
  if (faceWidth < 0.08 || faceHeight < 0.12) return defaultWarpGeometry();

  const faceCenter = map(bounds.center) || midpoint(topLeft, bottomRight);
  const leftEye = map(anchors.leftEye);
  const rightEye = map(anchors.rightEye);
  const leftCheek = map(anchors.leftCheek);
  const rightCheek = map(anchors.rightCheek);
  const forehead = map(anchors.forehead);
  const mouth = map(anchors.mouth);
  const chin = map(anchors.chin);
  const jawLeft = map(anchors.jawLeft);
  const jawRight = map(anchors.jawRight);

  if (
    !faceCenter
    || !leftEye
    || !rightEye
    || !leftCheek
    || !rightCheek
    || !forehead
    || !mouth
    || !chin
  ) {
    return defaultWarpGeometry();
  }

  const faceRadiusX = clamp(faceWidth * 0.54, 0.1, 0.5);
  const faceRadiusY = clamp(faceHeight * 0.54, 0.14, 0.54);
  const eyeDistance = clamp(distance(leftEye, rightEye), faceRadiusX * 0.45, faceRadiusX * 1.45);
  const eyeRadiusX = clamp(eyeDistance * 0.24, faceRadiusX * 0.13, faceRadiusX * 0.3);
  const eyeRadiusY = clamp(faceRadiusY * 0.105, 0.018, faceRadiusY * 0.18);
  const jawWidth = distance(jawLeft, jawRight) || faceRadiusX * 1.55;
  const jawCenter = midpoint(midpoint(jawLeft, jawRight) || faceCenter, midpoint(mouth, chin, 0.62), 0.55);
  const jawHeight = Math.max(distance(mouth, chin) * 0.72, faceRadiusY * 0.2);

  return {
    anchored: true,
    face: region(faceCenter, faceRadiusX, faceRadiusY),
    forehead: region(forehead, faceRadiusX * 0.58, faceRadiusY * 0.28),
    leftEye: region(leftEye, eyeRadiusX, eyeRadiusY),
    rightEye: region(rightEye, eyeRadiusX, eyeRadiusY),
    leftCheek: region(leftCheek, faceRadiusX * 0.31, faceRadiusY * 0.23),
    rightCheek: region(rightCheek, faceRadiusX * 0.31, faceRadiusY * 0.23),
    mouth: region(mouth, faceRadiusX * 0.38, faceRadiusY * 0.15),
    jaw: region(
      jawCenter || midpoint(mouth, chin, 0.6),
      clamp(jawWidth * 0.43, faceRadiusX * 0.54, faceRadiusX * 0.86),
      clamp(jawHeight, faceRadiusY * 0.2, faceRadiusY * 0.42)
    ),
    crop: {
      scale: transform.scale,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY,
      sourceWidth: transform.sourceWidth,
      sourceHeight: transform.sourceHeight,
      targetWidth: transform.targetWidth,
      targetHeight: transform.targetHeight
    }
  };
}

export default createWarpGeometry;
