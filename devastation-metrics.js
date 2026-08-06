const SCHEMA_VERSION = 4;

const SIGNAL_WEIGHTS = Object.freeze({
  pose: 0.18,
  eyes: 0.15,
  mouth: 0.08,
  asymmetry: 0.15,
  stability: 0.16,
  exposure: 0.12,
  sharpness: 0.16
});

const FACE_OVAL = Object.freeze([
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
]);

const ANCHOR_GROUPS = Object.freeze({
  leftEye: Object.freeze([263, 362, 386, 374, 473]),
  rightEye: Object.freeze([33, 133, 159, 145, 468]),
  leftCheek: Object.freeze([454, 323, 361]),
  rightCheek: Object.freeze([234, 93, 132]),
  forehead: Object.freeze([10]),
  noseTip: Object.freeze([1]),
  mouth: Object.freeze([61, 291, 13, 14]),
  mouthLeft: Object.freeze([291]),
  mouthRight: Object.freeze([61]),
  upperLip: Object.freeze([13, 0, 267, 37]),
  lowerLip: Object.freeze([14, 17, 314, 84]),
  leftTemple: Object.freeze([356, 389, 454]),
  rightTemple: Object.freeze([127, 162, 234]),
  leftBrow: Object.freeze([282, 295, 285]),
  rightBrow: Object.freeze([52, 65, 55]),
  chin: Object.freeze([152]),
  jawLeft: Object.freeze([454]),
  jawRight: Object.freeze([234])
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, precision = 0) => {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedPoint(point, mirrorX) {
  const x = clamp(finite(point?.x), 0, 1);
  return {
    x: mirrorX ? 1 - x : x,
    y: clamp(finite(point?.y), 0, 1),
    z: finite(point?.z)
  };
}

function pointAt(points, index) {
  return points[index] || null;
}

function pixelPoint(points, index, width, height) {
  const point = pointAt(points, index);
  if (!point) return null;
  return {
    x: point.x * width,
    y: point.y * height,
    z: point.z
  };
}

function distance(first, second) {
  if (!first || !second) return 0;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function average(values) {
  const available = values.filter(Number.isFinite);
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : 0;
}

function averagePoint(points, indices) {
  const valid = indices.map((index) => pointAt(points, index)).filter(Boolean);
  if (!valid.length) return null;
  const total = valid.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z
  }), { x: 0, y: 0, z: 0 });
  return {
    x: total.x / valid.length,
    y: total.y / valid.length,
    z: total.z / valid.length
  };
}

function averagePixelPoint(points, indices, width, height) {
  const value = averagePoint(points, indices);
  if (!value) return null;
  return {
    x: value.x * width,
    y: value.y * height,
    z: value.z
  };
}

function calculateBounds(points) {
  const outline = FACE_OVAL.map((index) => pointAt(points, index)).filter(Boolean);
  const source = outline.length >= 12 ? outline : points.filter(Boolean);
  if (!source.length) return null;

  const bounds = source.reduce((value, point) => ({
    minX: Math.min(value.minX, point.x),
    minY: Math.min(value.minY, point.y),
    maxX: Math.max(value.maxX, point.x),
    maxY: Math.max(value.maxY, point.y)
  }), {
    minX: 1,
    minY: 1,
    maxX: 0,
    maxY: 0
  });

  const width = clamp(bounds.maxX - bounds.minX, 0.01, 1);
  const height = clamp(bounds.maxY - bounds.minY, 0.01, 1);
  return {
    x: clamp(bounds.minX, 0, 1),
    y: clamp(bounds.minY, 0, 1),
    width,
    height,
    center: {
      x: clamp(bounds.minX + width / 2, 0, 1),
      y: clamp(bounds.minY + height / 2, 0, 1)
    }
  };
}

function eyeRatio(points, indices, width, height) {
  const top = pixelPoint(points, indices.top, width, height);
  const bottom = pixelPoint(points, indices.bottom, width, height);
  const outer = pixelPoint(points, indices.outer, width, height);
  const inner = pixelPoint(points, indices.inner, width, height);
  const horizontal = distance(outer, inner);
  return horizontal > 0 ? distance(top, bottom) / horizontal : 0;
}

function apertureFromRatio(ratio) {
  // Broad calibration band: closed ≈ 0.10, comfortably open ≈ 0.34.
  return clamp(((ratio - 0.10) / 0.24) * 100, 0, 100);
}

function eyeEffectIntensity(apertura, leftRatio, rightRatio) {
  const closure = clamp((32 - apertura) / 32, 0, 1);
  const widening = clamp((apertura - 86) / 14, 0, 1);
  const meanRatio = Math.max(0.04, (leftRatio + rightRatio) / 2);
  const imbalance = clamp(Math.abs(leftRatio - rightRatio) / meanRatio / 0.7, 0, 1);
  return Math.max(closure, widening, imbalance);
}

function directionalDeadZone(value, deadZone = 0.12) {
  const bounded = clamp(finite(value), -1, 1);
  const magnitude = Math.abs(bounded);
  if (magnitude <= deadZone) return 0;
  return Math.sign(bounded) * clamp((magnitude - deadZone) / (1 - deadZone), 0, 1);
}

function gazeSignals(points, width, height) {
  if (!Array.isArray(points) || points.length < 478) {
    return { available: false, x: 0, y: 0 };
  }

  const eyeOffset = ({ iris, outer, inner, top, bottom }) => {
    const irisCenter = pixelPoint(points, iris, width, height);
    const outerCorner = pixelPoint(points, outer, width, height);
    const innerCorner = pixelPoint(points, inner, width, height);
    const upperLid = pixelPoint(points, top, width, height);
    const lowerLid = pixelPoint(points, bottom, width, height);
    if (!irisCenter || !outerCorner || !innerCorner || !upperLid || !lowerLid) return null;

    const eyeCenter = {
      x: (outerCorner.x + innerCorner.x) / 2,
      y: (upperLid.y + lowerLid.y) / 2
    };
    const eyeWidth = distance(outerCorner, innerCorner);
    const eyeHeight = distance(upperLid, lowerLid);
    if (eyeWidth < 1 || eyeHeight < 0.5) return null;

    return {
      x: clamp((irisCenter.x - eyeCenter.x) / (eyeWidth * 0.34), -1, 1),
      y: clamp((irisCenter.y - eyeCenter.y) / (eyeHeight * 0.62), -1, 1)
    };
  };

  const right = eyeOffset({ iris: 468, outer: 33, inner: 133, top: 159, bottom: 145 });
  const left = eyeOffset({ iris: 473, outer: 263, inner: 362, top: 386, bottom: 374 });
  if (!right || !left) return { available: false, x: 0, y: 0 };

  return {
    available: true,
    x: round(directionalDeadZone((right.x + left.x) / 2), 3),
    y: round(directionalDeadZone((right.y + left.y) / 2), 3)
  };
}

function poseSignals(points, width, height) {
  const rightEye = averagePixelPoint(points, [33, 133, 159, 145], width, height);
  const leftEye = averagePixelPoint(points, [263, 362, 386, 374], width, height);
  const nose = pixelPoint(points, 1, width, height);
  const chin = pixelPoint(points, 152, width, height);
  const jawLeft = pixelPoint(points, 454, width, height);
  const jawRight = pixelPoint(points, 234, width, height);
  if (!rightEye || !leftEye || !nose || !chin || !jawLeft || !jawRight) {
    return {
      intensity: 0,
      rollDegrees: 0,
      yawImbalance: 0,
      yawOffset: 0,
      yawDirection: 0,
      pitchRatio: 0.46
    };
  }

  let rollDegrees = Math.atan2(
    leftEye.y - rightEye.y,
    leftEye.x - rightEye.x
  ) * 180 / Math.PI;
  if (rollDegrees > 90) rollDegrees -= 180;
  if (rollDegrees < -90) rollDegrees += 180;
  const leftDistance = distance(nose, jawLeft);
  const rightDistance = distance(nose, jawRight);
  const yawImbalance = Math.abs(leftDistance - rightDistance)
    / Math.max(1, leftDistance + rightDistance);
  const jawWidth = distance(jawLeft, jawRight);
  const jawCenterX = (jawLeft.x + jawRight.x) / 2;
  const yawOffset = jawWidth > 0 ? (nose.x - jawCenterX) / jawWidth : 0;
  const yawDirection = Math.sign(yawOffset)
    * clamp((Math.abs(yawOffset) - 0.012) / 0.16, 0, 1);
  const eyeMidpoint = {
    x: (rightEye.x + leftEye.x) / 2,
    y: (rightEye.y + leftEye.y) / 2
  };
  const pitchRatio = distance(eyeMidpoint, chin) > 0
    ? (nose.y - eyeMidpoint.y) / (chin.y - eyeMidpoint.y || 1)
    : 0.46;

  const rollIntensity = clamp((Math.abs(rollDegrees) - 3) / 22, 0, 1);
  const yawIntensity = clamp((yawImbalance - 0.035) / 0.24, 0, 1);
  const pitchDistance = pitchRatio < 0.3
    ? 0.3 - pitchRatio
    : Math.max(0, pitchRatio - 0.62);
  const pitchIntensity = clamp(pitchDistance / 0.24, 0, 1);

  return {
    intensity: round(
      Math.max(rollIntensity, yawIntensity, pitchIntensity) * 0.72
        + average([rollIntensity, yawIntensity, pitchIntensity]) * 0.28,
      3
    ),
    rollDegrees: round(rollDegrees, 2),
    yawImbalance: round(yawImbalance, 4),
    yawOffset: round(yawOffset, 4),
    yawDirection: round(yawDirection, 3),
    pitchRatio: round(pitchRatio, 4)
  };
}

function mouthSignals(points, width, height) {
  const upper = pixelPoint(points, 13, width, height);
  const lower = pixelPoint(points, 14, width, height);
  const left = pixelPoint(points, 61, width, height);
  const right = pixelPoint(points, 291, width, height);
  const mouthWidth = distance(left, right);
  const opennessRatio = mouthWidth > 0 ? distance(upper, lower) / mouthWidth : 0;
  return {
    opennessRatio: round(opennessRatio, 4),
    intensity: round(clamp((opennessRatio - 0.08) / 0.34, 0, 1), 3)
  };
}

function combinedAsymmetry(points, width, height, leftEyeRatio, rightEyeRatio, mouthRatio) {
  const eyeMean = Math.max(0.04, (leftEyeRatio + rightEyeRatio) / 2);
  const eyeBalance = clamp((leftEyeRatio - rightEyeRatio) / eyeMean / 0.7, -1, 1);
  const eyeDifference = Math.abs(eyeBalance);
  const nose = pixelPoint(points, 1, width, height);
  const leftCheek = averagePixelPoint(points, [454, 323, 361], width, height);
  const rightCheek = averagePixelPoint(points, [234, 93, 132], width, height);
  const leftDistance = distance(nose, leftCheek);
  const rightDistance = distance(nose, rightCheek);
  const cheekBalance = clamp(
    (leftDistance - rightDistance) / Math.max(1, (leftDistance + rightDistance) / 2) / 0.42,
    -1,
    1
  );
  const cheekDifference = Math.abs(cheekBalance);
  const mouthDifference = clamp(Math.abs(mouthRatio) / 0.16, 0, 1);
  return {
    eyeDifference: round(eyeDifference, 4),
    eyeBalance: round(eyeBalance, 4),
    cheekDifference: round(cheekDifference, 4),
    cheekBalance: round(cheekBalance, 4),
    intensity: round(
      Math.max(eyeDifference, cheekDifference, mouthDifference) * 0.68
        + average([eyeDifference, cheekDifference, mouthDifference]) * 0.32,
      3
    )
  };
}

function headTilt(points, width, height) {
  const forehead = pixelPoint(points, 10, width, height);
  const chin = pixelPoint(points, 152, width, height);
  if (!forehead || !chin) return 0;
  const deltaX = chin.x - forehead.x;
  const deltaY = chin.y - forehead.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 0.001) return 0;
  return clamp(Math.abs(Math.atan2(deltaX, deltaY) * 180 / Math.PI), 0, 45);
}

function signedMouthAsymmetry(points, width, height) {
  const forehead = pixelPoint(points, 10, width, height);
  const chin = pixelPoint(points, 152, width, height);
  const left = pixelPoint(points, 61, width, height);
  const right = pixelPoint(points, 291, width, height);
  if (!forehead || !chin || !left || !right) return 0;

  const axisX = chin.x - forehead.x;
  const axisY = chin.y - forehead.y;
  const axisLength = Math.hypot(axisX, axisY);
  const mouthX = right.x - left.x;
  const mouthY = right.y - left.y;
  const mouthLength = Math.hypot(mouthX, mouthY);
  if (!axisLength || !mouthLength) return 0;

  // Project the mouth-corner vector onto the face's own vertical axis.
  // This removes ordinary head roll before classifying corner asymmetry.
  const verticalX = axisX / axisLength;
  const verticalY = axisY / axisLength;
  return clamp((mouthX * verticalX + mouthY * verticalY) / mouthLength, -1, 1);
}

function asymmetryLabel(ratio) {
  if (ratio < 0.045) return 'nízká';
  if (ratio < 0.105) return 'střední';
  return 'vysoká';
}

function asymmetryHumanity(label) {
  if (label === 'nízká') return 100;
  if (label === 'střední') return 58;
  return 18;
}

function calculateHumanity({ apertura, gravitace, asymetrie, hydratace }) {
  const upright = 100 - (gravitace / 45) * 100;
  return clamp(
    apertura * 0.42
      + upright * 0.28
      + asymmetryHumanity(asymetrie) * 0.18
      + hydratace * 0.12,
    0,
    100
  );
}

function randomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 0xffffffff;
  }
  return Math.random();
}

function normalizedRandom(random) {
  const sample = finite(random(), 0.5);
  return clamp(sample, 0, 0.9999999999999999);
}

function weightedSignalScore(signals) {
  const available = Object.entries(SIGNAL_WEIGHTS)
    .map(([key, weight]) => ({
      key,
      weight,
      rawValue: signals?.[key],
      value: Number(signals?.[key])
    }))
    .filter((signal) => (
      signal.rawValue !== null
      && signal.rawValue !== undefined
      && Number.isFinite(signal.value)
    ));
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  if (!totalWeight) return { score: 0, contributions: {} };

  const contributions = Object.fromEntries(available.map((signal) => [
    signal.key,
    round(signal.value * signal.weight / totalWeight * 100, 2)
  ]));
  return {
    score: clamp(round(
      available.reduce((sum, signal) => sum + signal.value * signal.weight, 0)
        / totalWeight * 100
    ), 0, 100),
    contributions
  };
}

function severityScores(signals, random) {
  const weighted = weightedSignalScore(signals);
  const signalScore = weighted.score;
  const randomScore = 12 + normalizedRandom(random) * 86;
  return {
    signalScore: round(signalScore),
    randomScore: round(randomScore),
    severity: clamp(Math.round(signalScore * 0.70 + randomScore * 0.30), 12, 98),
    mix: Object.freeze({ visual: 0.70, random: 0.30 }),
    weights: SIGNAL_WEIGHTS,
    contributions: weighted.contributions
  };
}

function sourceDimensions(source) {
  const width = finite(source?.naturalWidth || source?.videoWidth || source?.width);
  const height = finite(source?.naturalHeight || source?.videoHeight || source?.height);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

function loadImage(source) {
  if (typeof source !== 'string') {
    const dimensions = sourceDimensions(source);
    if (dimensions.width > 1 && dimensions.height > 1) {
      return Promise.resolve({ source, ...dimensions, release() {} });
    }
    return Promise.reject(new Error('Zdroj obrázku nemá platné rozměry.'));
  }

  if (typeof Image !== 'function') {
    return Promise.reject(new Error('Dekódování obrázku není v tomto prostředí dostupné.'));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const dimensions = sourceDimensions(image);
      resolve({
        source: image,
        ...dimensions,
        release() {
          image.removeAttribute('src');
        }
      });
    };
    image.onerror = () => reject(new Error('Zdroj metrik se nepovedlo dekódovat.'));
    image.src = source;
  });
}

function hydrationFromExposure(meanLuma, clippedRatio, contrast) {
  // This is deliberately a low, satirical exposure score. It is not a
  // physiological hydration estimate and never classifies skin colour.
  const midpointQuality = clamp(1 - Math.abs(meanLuma - 138) / 118, 0, 1);
  const clippingPenalty = clamp(clippedRatio * 2.4, 0, 1);
  const contrastQuality = clamp(contrast / 52, 0, 1);
  const usableLight = clamp(
    midpointQuality * 0.66 + contrastQuality * 0.34 - clippingPenalty * 0.45,
    0,
    1
  );
  return clamp(Math.round(7 + usableLight * 31), 5, 38);
}

function createSamplingCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function sampleFaceVisualQuality(imageSource, faceBounds, canvasFactory = createSamplingCanvas) {
  const loaded = await loadImage(imageSource);
  const sampleWidth = 96;
  const sampleHeight = 112;
  const canvas = canvasFactory(sampleWidth, sampleHeight);
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!context) {
    loaded.release();
    throw new Error('Canvas pro lokální sampling není dostupný.');
  }

  const insetX = faceBounds.width * 0.14;
  const insetY = faceBounds.height * 0.12;
  const sourceX = clamp((faceBounds.x + insetX) * loaded.width, 0, loaded.width - 1);
  const sourceY = clamp((faceBounds.y + insetY) * loaded.height, 0, loaded.height - 1);
  const sourceWidth = clamp(
    (faceBounds.width - insetX * 2) * loaded.width,
    1,
    loaded.width - sourceX
  );
  const sourceHeight = clamp(
    (faceBounds.height - insetY * 2) * loaded.height,
    1,
    loaded.height - sourceY
  );

  context.drawImage(
    loaded.source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sampleWidth,
    sampleHeight
  );

  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let sum = 0;
  let squares = 0;
  let clipped = 0;
  const count = pixels.length / 4;
  const luma = new Float32Array(count);

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.2126
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.0722;
    luma[index / 4] = luminance;
    sum += luminance;
    squares += luminance * luminance;
    if (luminance < 30 || luminance > 235) clipped += 1;
  }

  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const index = y * sampleWidth + x;
      const laplacian = luma[index] * 4
        - luma[index - 1]
        - luma[index + 1]
        - luma[index - sampleWidth]
        - luma[index + sampleWidth];
      laplacianSum += laplacian;
      laplacianSquares += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  loaded.release();
  const meanLuma = sum / count;
  const contrast = Math.sqrt(Math.max(0, squares / count - meanLuma * meanLuma));
  const clippedRatio = clipped / count;
  const laplacianMean = laplacianCount ? laplacianSum / laplacianCount : 0;
  const laplacianVariance = laplacianCount
    ? Math.max(0, laplacianSquares / laplacianCount - laplacianMean * laplacianMean)
    : 0;
  const sharpnessQuality = clamp((laplacianVariance - 45) / 605, 0, 1);
  const hydratace = hydrationFromExposure(meanLuma, clippedRatio, contrast);
  return {
    exposure: {
      available: true,
      meanLuma: round(meanLuma, 1),
      contrast: round(contrast, 1),
      clippedRatio: round(clippedRatio, 3),
      hydratace,
      intensity: round(1 - clamp(hydratace / 38, 0, 1), 3)
    },
    sharpness: {
      available: true,
      laplacianVariance: round(laplacianVariance, 2),
      intensity: round(1 - sharpnessQuality, 3)
    }
  };
}

export function normalizeLandmarks(landmarks, { mirrorX = false } = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) {
    throw new TypeError('Face Mesh musí dodat alespoň 468 landmark bodů.');
  }
  return landmarks.map((point) => normalizedPoint(point, mirrorX));
}

export function calculateDevastationMetrics(
  normalizedLandmarks,
  {
    sourceWidth = 1,
    sourceHeight = 1,
    hydratace = 18
  } = {}
) {
  if (!Array.isArray(normalizedLandmarks) || normalizedLandmarks.length < 468) {
    throw new TypeError('Pro výpočet metrik chybí normalizované landmarky.');
  }

  const width = Math.max(1, finite(sourceWidth, 1));
  const height = Math.max(1, finite(sourceHeight, 1));
  const rightEyeRatio = eyeRatio(normalizedLandmarks, {
    top: 159,
    bottom: 145,
    outer: 33,
    inner: 133
  }, width, height);
  const leftEyeRatio = eyeRatio(normalizedLandmarks, {
    top: 386,
    bottom: 374,
    outer: 263,
    inner: 362
  }, width, height);
  const meanEyeRatio = (rightEyeRatio + leftEyeRatio) / 2;
  const apertura = clamp(round(apertureFromRatio(meanEyeRatio)), 0, 100);
  const gravitace = round(headTilt(normalizedLandmarks, width, height), 1);
  const pose = poseSignals(normalizedLandmarks, width, height);
  const gaze = gazeSignals(normalizedLandmarks, width, height);
  const mouth = mouthSignals(normalizedLandmarks, width, height);
  const mouthAsymmetryDirection = signedMouthAsymmetry(normalizedLandmarks, width, height);
  const asymmetryRatio = Math.abs(mouthAsymmetryDirection);
  const combined = combinedAsymmetry(
    normalizedLandmarks,
    width,
    height,
    leftEyeRatio,
    rightEyeRatio,
    asymmetryRatio
  );
  const asymetrie = asymmetryLabel(asymmetryRatio);
  const safeHydration = clamp(round(finite(hydratace, 18)), 0, 100);
  const lidskost = round(calculateHumanity({
    apertura,
    gravitace,
    asymetrie,
    hydratace: safeHydration
  }));

  return {
    metrics: {
      apertura,
      lidskost,
      gravitace,
      asymetrie,
      hydratace: safeHydration
    },
    raw: {
      rightEyeRatio: round(rightEyeRatio, 4),
      leftEyeRatio: round(leftEyeRatio, 4),
      meanEyeRatio: round(meanEyeRatio, 4),
      mouthAsymmetryRatio: round(asymmetryRatio, 4),
      mouthAsymmetryDirection: round(mouthAsymmetryDirection, 4),
      mouthOpennessRatio: mouth.opennessRatio,
      eyeAsymmetryRatio: combined.eyeDifference,
      eyeAsymmetryDirection: combined.eyeBalance,
      cheekAsymmetryRatio: combined.cheekDifference,
      cheekAsymmetryDirection: combined.cheekBalance,
      rollDegrees: pose.rollDegrees,
      yawImbalance: pose.yawImbalance,
      yawOffset: pose.yawOffset,
      pitchRatio: pose.pitchRatio,
      gazeAvailable: gaze.available,
      gazeX: gaze.x,
      gazeY: gaze.y
    },
    directions: {
      yaw: pose.yawDirection,
      roll: round(clamp(pose.rollDegrees / 25, -1, 1), 3),
      pitch: round(clamp((pose.pitchRatio - 0.46) / 0.22, -1, 1), 3),
      eyes: round(combined.eyeBalance, 3),
      cheeks: round(combined.cheekBalance, 3),
      mouth: round(clamp(mouthAsymmetryDirection / 0.16, -1, 1), 3),
      gazeX: gaze.x,
      gazeY: gaze.y
    },
    signals: {
      // Every signal is effect intensity: higher means stronger visual input,
      // never a judgment about the person in the photo.
      eyes: round(eyeEffectIntensity(apertura, leftEyeRatio, rightEyeRatio), 3),
      pose: pose.intensity,
      mouth: mouth.intensity,
      asymmetry: combined.intensity,
      exposure: round(1 - clamp(safeHydration / 38, 0, 1), 3)
    }
  };
}

function normalizeSignalObservation(observation, { available = true } = {}) {
  const rawValue = observation?.intensity ?? observation?.value;
  const value = Number(rawValue);
  const isAvailable = available
    && observation?.available !== false
    && rawValue !== null
    && rawValue !== undefined
    && Number.isFinite(value);
  return {
    ...(observation && typeof observation === 'object' ? observation : {}),
    available: isAvailable,
    value: isAvailable ? round(clamp(value, 0, 1), 3) : null
  };
}

export function buildFaceAnalysis({
  landmarks,
  sourceKind = 'camera',
  mirrorX = false,
  sourceWidth = 1,
  sourceHeight = 1,
  exposure = null,
  sharpness = null,
  stability = null,
  random = randomUnit,
  timestamp = new Date().toISOString()
}) {
  const normalizedSourceKind = sourceKind === 'upload' ? 'upload' : 'camera';
  const normalizedLandmarks = normalizeLandmarks(landmarks, { mirrorX });
  const faceBounds = calculateBounds(normalizedLandmarks);
  if (!faceBounds) throw new Error('Z landmarků nejde sestavit oblast obličeje.');

  const measurement = calculateDevastationMetrics(normalizedLandmarks, {
    sourceWidth,
    sourceHeight,
    hydratace: exposure?.hydratace
  });
  const exposureObservation = normalizeSignalObservation(exposure ? {
    ...exposure,
    intensity: exposure.intensity ?? measurement.signals.exposure
  } : null);
  const sharpnessObservation = normalizeSignalObservation(sharpness);
  const stabilityObservation = normalizeSignalObservation(stability, {
    available: normalizedSourceKind === 'camera'
  });
  const signals = {
    ...measurement.signals,
    exposure: exposureObservation.value,
    sharpness: sharpnessObservation.value,
    stability: stabilityObservation.value
  };
  const scores = severityScores(signals, random);
  const anchors = Object.fromEntries(
    Object.entries(ANCHOR_GROUPS).map(([name, indices]) => [
      name,
      averagePoint(normalizedLandmarks, indices)
    ])
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    sourceKind: normalizedSourceKind,
    timestamp,
    normalizedLandmarks,
    faceBounds,
    anchors,
    directions: measurement.directions,
    raw: {
      ...measurement.raw,
      exposure: exposure || {
        available: false,
        meanLuma: null,
        contrast: null,
        clippedRatio: null,
        hydratace: measurement.metrics.hydratace
      },
      sharpness: sharpnessObservation,
      stability: stabilityObservation
    },
    signals,
    signalAvailability: Object.fromEntries(
      Object.keys(SIGNAL_WEIGHTS).map((key) => [
        key,
        typeof signals[key] === 'number' && Number.isFinite(signals[key])
      ])
    ),
    metrics: measurement.metrics,
    scores,
    disclaimer: 'Satirický vizuální výpočet; nejde o diagnózu ani detekci užití látek.'
  };
}

export async function analyzeFaceImage({
  landmarks,
  imageSource,
  sourceKind = 'camera',
  mirrorX = false,
  stability = null,
  random = randomUnit,
  canvasFactory = createSamplingCanvas
}) {
  const loaded = await loadImage(imageSource);
  const sourceWidth = loaded.width;
  const sourceHeight = loaded.height;
  const normalizedLandmarks = normalizeLandmarks(landmarks, { mirrorX });
  const faceBounds = calculateBounds(normalizedLandmarks);
  loaded.release();
  if (!faceBounds) throw new Error('Z landmarků nejde sestavit oblast obličeje.');

  let visualQuality;
  try {
    visualQuality = await sampleFaceVisualQuality(imageSource, faceBounds, canvasFactory);
  } catch (error) {
    console.warn('Lokální jas a ostrost obličeje se nepovedly změřit:', error);
    visualQuality = {
      exposure: {
        available: false,
        meanLuma: null,
        contrast: null,
        clippedRatio: null,
        hydratace: 18,
        intensity: null
      },
      sharpness: {
        available: false,
        laplacianVariance: null,
        intensity: null
      }
    };
  }

  return buildFaceAnalysis({
    landmarks,
    sourceKind,
    mirrorX,
    sourceWidth,
    sourceHeight,
    exposure: visualQuality.exposure,
    sharpness: visualQuality.sharpness,
    stability,
    random
  });
}

export default analyzeFaceImage;
