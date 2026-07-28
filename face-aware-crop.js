/* Smažka v72 — shared face-aware crop geometry for renderer, UI and export. */
(() => {
  'use strict';

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function sourceDimensions(image) {
    return {
      width: Math.max(1, finite(image?.naturalWidth || image?.videoWidth || image?.width, 1)),
      height: Math.max(1, finite(image?.naturalHeight || image?.videoHeight || image?.height, 1))
    };
  }

  function validPoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
  }

  function normalizedBounds(faceAnalysis) {
    const bounds = faceAnalysis?.faceBounds;
    if (!bounds) return null;

    const x = clamp(finite(bounds.x), 0, 1);
    const y = clamp(finite(bounds.y), 0, 1);
    const width = clamp(finite(bounds.width, 0.24), 0.02, 1 - x);
    const height = clamp(finite(bounds.height, 0.34), 0.02, 1 - y);
    return {
      x,
      y,
      width,
      height,
      center: {
        x: clamp(finite(bounds.center?.x, x + width / 2), 0, 1),
        y: clamp(finite(bounds.center?.y, y + height / 2), 0, 1)
      }
    };
  }

  function eyeCenter(faceAnalysis, bounds) {
    const left = faceAnalysis?.anchors?.leftEye;
    const right = faceAnalysis?.anchors?.rightEye;
    if (validPoint(left) && validPoint(right)) {
      return {
        x: clamp((finite(left.x) + finite(right.x)) / 2, 0, 1),
        y: clamp((finite(left.y) + finite(right.y)) / 2, 0, 1)
      };
    }
    return {
      x: bounds?.center?.x ?? 0.5,
      y: bounds ? clamp(bounds.y + bounds.height * 0.38, 0, 1) : 0.4
    };
  }

  function constrainOffset(desired, cropSize, sourceSize, safeMin, safeMax) {
    const maximum = Math.max(0, sourceSize - cropSize);
    const preferred = clamp(desired, 0, maximum);
    const lower = clamp(safeMax - cropSize, 0, maximum);
    const upper = clamp(safeMin, 0, maximum);
    return lower <= upper ? clamp(preferred, lower, upper) : preferred;
  }

  function calculateCrop({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    faceAnalysis = null
  } = {}) {
    const width = Math.max(1, finite(sourceWidth, 1));
    const height = Math.max(1, finite(sourceHeight, 1));
    const outputWidth = Math.max(1, finite(targetWidth, 1));
    const outputHeight = Math.max(1, finite(targetHeight, 1));
    const sourceRatio = width / height;
    const targetRatio = outputWidth / outputHeight;

    let cropWidth = width;
    let cropHeight = height;
    if (sourceRatio > targetRatio) cropWidth = height * targetRatio;
    else cropHeight = width / targetRatio;

    const bounds = normalizedBounds(faceAnalysis);
    const eyes = eyeCenter(faceAnalysis, bounds);
    const faceCenterX = bounds?.center?.x ?? eyes.x;
    const eyeTargetY = targetRatio >= 1.05 ? 0.43 : targetRatio >= 0.82 ? 0.39 : 0.36;

    let x = faceCenterX * width - cropWidth * 0.5;
    let y = eyes.y * height - cropHeight * eyeTargetY;

    if (bounds) {
      const faceWidth = bounds.width * width;
      const faceHeight = bounds.height * height;
      const safeMinX = (bounds.x * width) - faceWidth * 0.32;
      const safeMaxX = ((bounds.x + bounds.width) * width) + faceWidth * 0.32;
      const safeMinY = (bounds.y * height) - faceHeight * 0.42;
      const safeMaxY = ((bounds.y + bounds.height) * height) + faceHeight * 0.52;
      x = constrainOffset(x, cropWidth, width, safeMinX, safeMaxX);
      y = constrainOffset(y, cropHeight, height, safeMinY, safeMaxY);
    } else {
      x = clamp(x, 0, Math.max(0, width - cropWidth));
      y = clamp(y, 0, Math.max(0, height - cropHeight));
    }

    const overflowX = Math.max(0, width - cropWidth);
    const overflowY = Math.max(0, height - cropHeight);
    return Object.freeze({
      sx: clamp(x, 0, overflowX),
      sy: clamp(y, 0, overflowY),
      sw: cropWidth,
      sh: cropHeight,
      sourceWidth: width,
      sourceHeight: height,
      targetWidth: outputWidth,
      targetHeight: outputHeight,
      objectPositionX: overflowX > 0 ? clamp(x / overflowX * 100, 0, 100) : 50,
      objectPositionY: overflowY > 0 ? clamp(y / overflowY * 100, 0, 100) : 50,
      hasFace: Boolean(bounds)
    });
  }

  function transformPoint(point, crop) {
    if (!validPoint(point)) return point || null;
    return {
      ...point,
      x: clamp((finite(point.x) * crop.sourceWidth - crop.sx) / crop.sw, 0, 1),
      y: clamp((finite(point.y) * crop.sourceHeight - crop.sy) / crop.sh, 0, 1)
    };
  }

  function transformBounds(bounds, crop) {
    if (!bounds) return null;
    const start = transformPoint({ x: bounds.x, y: bounds.y }, crop);
    const end = transformPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, crop);
    const x = clamp(Math.min(start.x, end.x), 0, 1);
    const y = clamp(Math.min(start.y, end.y), 0, 1);
    const width = clamp(Math.abs(end.x - start.x), 0.01, 1 - x);
    const height = clamp(Math.abs(end.y - start.y), 0.01, 1 - y);
    return {
      x,
      y,
      width,
      height,
      center: { x: x + width / 2, y: y + height / 2 }
    };
  }

  function transformFaceAnalysis(faceAnalysis, crop) {
    if (!faceAnalysis || !crop) return faceAnalysis || null;
    const normalizedLandmarks = Array.isArray(faceAnalysis.normalizedLandmarks)
      ? faceAnalysis.normalizedLandmarks.map((point) => transformPoint(point, crop))
      : faceAnalysis.normalizedLandmarks;
    const anchors = faceAnalysis.anchors
      ? Object.fromEntries(Object.entries(faceAnalysis.anchors).map(([key, point]) => [key, transformPoint(point, crop)]))
      : faceAnalysis.anchors;

    return {
      ...faceAnalysis,
      normalizedLandmarks,
      anchors,
      faceBounds: transformBounds(faceAnalysis.faceBounds, crop),
      crop: {
        version: 72,
        source: {
          width: crop.sourceWidth,
          height: crop.sourceHeight,
          x: crop.sx,
          y: crop.sy,
          width: crop.sw,
          height: crop.sh
        },
        output: { width: crop.targetWidth, height: crop.targetHeight }
      }
    };
  }

  function drawImageCover(context, image, x, y, width, height, faceAnalysis = null) {
    const source = sourceDimensions(image);
    const crop = calculateCrop({
      sourceWidth: source.width,
      sourceHeight: source.height,
      targetWidth: width,
      targetHeight: height,
      faceAnalysis
    });
    context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
    return crop;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Zdroj face-aware výřezu se nepovedlo dekódovat.'));
      image.src = source;
    });
  }

  async function cropImageData(imageData, targetWidth, targetHeight, faceAnalysis = null, options = {}) {
    if (!imageData) throw new Error('Pro face-aware výřez chybí obrázek.');
    const image = await loadImage(imageData);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(finite(targetWidth, 720)));
    canvas.height = Math.max(1, Math.round(finite(targetHeight, 960)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas pro face-aware výřez není dostupný.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const crop = drawImageCover(context, image, 0, 0, canvas.width, canvas.height, faceAnalysis);
    image.removeAttribute('src');
    const type = options.type || 'image/jpeg';
    const quality = clamp(finite(options.quality, 0.92), 0.5, 1);
    return {
      dataUrl: canvas.toDataURL(type, quality),
      crop,
      faceAnalysis: transformFaceAnalysis(faceAnalysis, crop)
    };
  }

  globalThis.SmazkaFaceCrop = Object.freeze({
    calculateCrop,
    cropImageData,
    drawImageCover,
    sourceDimensions,
    transformFaceAnalysis
  });
})();
