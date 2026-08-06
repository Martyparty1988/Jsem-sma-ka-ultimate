const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function signed(value) {
  return clamp(finite(value), -1, 1);
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
    mask: [0.5, 0.48, 0.365, 0.4],
    face: [0.5, 0.48, 0.355, 0.39],
    forehead: [0.5, 0.285, 0.235, 0.17],
    leftTemple: [0.72, 0.39, 0.095, 0.12],
    rightTemple: [0.28, 0.39, 0.095, 0.12],
    leftBrow: [0.61, 0.345, 0.105, 0.045],
    rightBrow: [0.39, 0.345, 0.105, 0.045],
    leftEye: [0.39, 0.405, 0.095, 0.052],
    rightEye: [0.61, 0.405, 0.095, 0.052],
    leftCheek: [0.365, 0.51, 0.19, 0.19],
    rightCheek: [0.635, 0.51, 0.19, 0.19],
    nose: [0.5, 0.49, 0.105, 0.105],
    mouth: [0.5, 0.62, 0.15, 0.075],
    mouthLeft: [0.59, 0.62, 0.055, 0.05],
    mouthRight: [0.41, 0.62, 0.055, 0.05],
    upperLip: [0.5, 0.603, 0.14, 0.035],
    lowerLip: [0.5, 0.637, 0.14, 0.04],
    jaw: [0.5, 0.69, 0.265, 0.185],
    controls: {
      yaw: 0,
      roll: 0,
      pitch: 0,
      eyes: 0,
      cheeks: 0,
      mouth: 0,
      gazeX: 0,
      gazeY: 0,
      pose: 0,
      eyeIntensity: 0,
      mouthOpen: 0,
      asymmetry: 0
    },
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
  const leftTempleAnchor = map(anchors.leftTemple);
  const rightTempleAnchor = map(anchors.rightTemple);
  const leftBrowAnchor = map(anchors.leftBrow);
  const rightBrowAnchor = map(anchors.rightBrow);
  const noseAnchor = map(anchors.noseTip);
  const mouth = map(anchors.mouth);
  const mouthLeftAnchor = map(anchors.mouthLeft);
  const mouthRightAnchor = map(anchors.mouthRight);
  const upperLipAnchor = map(anchors.upperLip);
  const lowerLipAnchor = map(anchors.lowerLip);
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
  const nose = noseAnchor || midpoint(midpoint(leftEye, rightEye), mouth, 0.56);
  const leftTemple = leftTempleAnchor || midpoint(forehead, leftCheek, 0.58);
  const rightTemple = rightTempleAnchor || midpoint(forehead, rightCheek, 0.58);
  const leftBrow = leftBrowAnchor || midpoint(leftEye, forehead, 0.3);
  const rightBrow = rightBrowAnchor || midpoint(rightEye, forehead, 0.3);
  const mouthLeft = mouthLeftAnchor || midpoint(mouth, leftCheek, 0.28);
  const mouthRight = mouthRightAnchor || midpoint(mouth, rightCheek, 0.28);
  const upperLip = upperLipAnchor || midpoint(mouth, nose, 0.12);
  const lowerLip = lowerLipAnchor || midpoint(mouth, chin, 0.12);
  const directions = faceAnalysis?.directions || {};

  return {
    anchored: true,
    mask: region(faceCenter, faceRadiusX * 1.025, faceRadiusY * 1.025),
    face: region(faceCenter, faceRadiusX, faceRadiusY),
    forehead: region(forehead, faceRadiusX * 0.58, faceRadiusY * 0.28),
    leftTemple: region(leftTemple, faceRadiusX * 0.22, faceRadiusY * 0.2),
    rightTemple: region(rightTemple, faceRadiusX * 0.22, faceRadiusY * 0.2),
    leftBrow: region(leftBrow, eyeRadiusX * 1.12, eyeRadiusY * 0.72),
    rightBrow: region(rightBrow, eyeRadiusX * 1.12, eyeRadiusY * 0.72),
    leftEye: region(leftEye, eyeRadiusX, eyeRadiusY),
    rightEye: region(rightEye, eyeRadiusX, eyeRadiusY),
    leftCheek: region(leftCheek, faceRadiusX * 0.31, faceRadiusY * 0.23),
    rightCheek: region(rightCheek, faceRadiusX * 0.31, faceRadiusY * 0.23),
    nose: region(nose, faceRadiusX * 0.2, faceRadiusY * 0.15),
    mouth: region(mouth, faceRadiusX * 0.38, faceRadiusY * 0.15),
    mouthLeft: region(mouthLeft, faceRadiusX * 0.12, faceRadiusY * 0.085),
    mouthRight: region(mouthRight, faceRadiusX * 0.12, faceRadiusY * 0.085),
    upperLip: region(upperLip, faceRadiusX * 0.34, faceRadiusY * 0.055),
    lowerLip: region(lowerLip, faceRadiusX * 0.34, faceRadiusY * 0.065),
    jaw: region(
      jawCenter || midpoint(mouth, chin, 0.6),
      clamp(jawWidth * 0.43, faceRadiusX * 0.54, faceRadiusX * 0.86),
      clamp(jawHeight, faceRadiusY * 0.2, faceRadiusY * 0.42)
    ),
    controls: {
      yaw: signed(directions.yaw),
      roll: signed(directions.roll),
      pitch: signed(directions.pitch),
      eyes: signed(directions.eyes),
      cheeks: signed(directions.cheeks),
      mouth: signed(directions.mouth),
      gazeX: signed(directions.gazeX),
      gazeY: signed(directions.gazeY),
      pose: clamp(finite(faceAnalysis?.signals?.pose), 0, 1),
      eyeIntensity: clamp(finite(faceAnalysis?.signals?.eyes), 0, 1),
      mouthOpen: clamp(finite(faceAnalysis?.signals?.mouth), 0, 1),
      asymmetry: clamp(finite(faceAnalysis?.signals?.asymmetry), 0, 1)
    },
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
