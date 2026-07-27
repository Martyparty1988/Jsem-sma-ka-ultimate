/* Smažka v50 — landmark-anchored JUNKIE forensic face effect. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result || typeof app.captureCurrentFrame !== 'function') return;

  const { state, elements } = app;
  const result = elements.result;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tailToken = (value) => String(value || '').slice(-56);
  const LANDMARK_MINIMUM = 24;
  const PROFILE = {
    key: 'junkie-forensic',
    label: 'JUNKIE FORENSIC',
    tone: 'hollow'
  };

  const GROUPS = {
    face: [10, 127, 234, 132, 172, 152, 397, 361, 454, 356],
    rightEye: [33, 133, 159, 145],
    leftEye: [263, 362, 386, 374],
    mouth: [61, 0, 291, 17, 78, 13, 308, 14]
  };

  let activeRun = 0;
  const originalCaptureCurrentFrame = app.captureCurrentFrame.bind(app);

  function pointDistance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function average(points) {
    if (!points.length) return null;
    const sum = points.reduce((value, point) => ({ x: value.x + point.x, y: value.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  function bounds(points) {
    if (!points.length) return null;
    return points.reduce((value, point) => ({
      minX: Math.min(value.minX, point.x),
      minY: Math.min(value.minY, point.y),
      maxX: Math.max(value.maxX, point.x),
      maxY: Math.max(value.maxY, point.y)
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    });
  }

  function collectLandmarkGeometry() {
    const mesh = document.querySelector('.face-landmark-mesh');
    const viewBox = mesh?.viewBox?.baseVal;
    const width = Number(viewBox?.width || 0);
    const height = Number(viewBox?.height || 0);
    if (!mesh || !width || !height) return null;

    const points = new Map();
    mesh.querySelectorAll('circle.landmark').forEach((circle) => {
      if (circle.hidden) return;
      const index = Number(circle.dataset.index);
      const x = Number(circle.getAttribute('cx')) / width;
      const y = Number(circle.getAttribute('cy')) / height;
      if (Number.isFinite(index) && Number.isFinite(x) && Number.isFinite(y)) {
        points.set(index, { x, y });
      }
    });
    if (points.size < LANDMARK_MINIMUM) return null;

    const fromIndices = (indices) => indices.map((index) => points.get(index)).filter(Boolean);
    const facePoints = fromIndices(GROUPS.face);
    const faceBounds = bounds(facePoints);
    if (!faceBounds) return null;

    const faceCenter = {
      x: (faceBounds.minX + faceBounds.maxX) / 2,
      y: (faceBounds.minY + faceBounds.maxY) / 2
    };
    const faceRadius = {
      x: Math.max(0.18, (faceBounds.maxX - faceBounds.minX) * 0.52),
      y: Math.max(0.24, (faceBounds.maxY - faceBounds.minY) * 0.52)
    };

    function eyeGeometry(indices) {
      const [outer, inner, upper, lower] = indices.map((index) => points.get(index));
      if (!outer || !inner || !upper || !lower) return null;
      const eyeWidth = Math.max(0.04, pointDistance(outer, inner));
      const center = average([outer, inner, upper, lower]);
      const downwardOffset = clamp(eyeWidth * 0.11, 8 / height, 14 / height);
      return {
        x: center.x,
        y: lower.y + downwardOffset,
        rx: eyeWidth * 0.7,
        ry: Math.max(0.018, eyeWidth * 0.24),
        eyeY: center.y
      };
    }

    const eyes = [eyeGeometry(GROUPS.rightEye), eyeGeometry(GROUPS.leftEye)]
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (eyes.length !== 2) return null;

    const mouthPoints = fromIndices(GROUPS.mouth);
    const mouthBounds = bounds(mouthPoints);
    const mouthCenter = average(mouthPoints);
    if (!mouthBounds || !mouthCenter) return null;

    const targetCheekY = eyes[0].eyeY + (mouthCenter.y - eyes[0].eyeY) * 0.58;
    const sidePoints = facePoints.filter((point) => Math.abs(point.y - targetCheekY) < faceRadius.y * 0.45);
    const leftSide = sidePoints.filter((point) => point.x < faceCenter.x).sort((a, b) => a.x - b.x)[0] || { x: faceBounds.minX, y: faceCenter.y };
    const rightSide = sidePoints.filter((point) => point.x > faceCenter.x).sort((a, b) => b.x - a.x)[0] || { x: faceBounds.maxX, y: faceCenter.y };
    const eyeLineY = (eyes[0].eyeY + eyes[1].eyeY) / 2;
    const cheekY = eyeLineY + (mouthCenter.y - eyeLineY) * 0.58;

    return {
      face: [faceCenter.x, faceCenter.y, faceRadius.x, faceRadius.y],
      leftEye: [eyes[0].x, eyes[0].y, eyes[0].rx, eyes[0].ry],
      rightEye: [eyes[1].x, eyes[1].y, eyes[1].rx, eyes[1].ry],
      leftCheek: [eyes[0].x * 0.58 + leftSide.x * 0.42, cheekY, faceRadius.x * 0.3, faceRadius.y * 0.2],
      rightCheek: [eyes[1].x * 0.58 + rightSide.x * 0.42, cheekY, faceRadius.x * 0.3, faceRadius.y * 0.2],
      leftTemple: [faceBounds.minX + faceRadius.x * 0.12, eyes[0].eyeY - faceRadius.y * 0.17, faceRadius.x * 0.17, faceRadius.y * 0.13],
      rightTemple: [faceBounds.maxX - faceRadius.x * 0.12, eyes[1].eyeY - faceRadius.y * 0.17, faceRadius.x * 0.17, faceRadius.y * 0.13],
      mouth: [
        mouthCenter.x,
        mouthCenter.y,
        Math.max(0.045, (mouthBounds.maxX - mouthBounds.minX) * 0.58),
        Math.max(0.018, (mouthBounds.maxY - mouthBounds.minY) * 0.86)
      ],
      jaw: [
        faceCenter.x,
        mouthCenter.y + (faceBounds.maxY - mouthCenter.y) * 0.52,
        faceRadius.x * 0.76,
        Math.max(0.08, (faceBounds.maxY - mouthCenter.y) * 0.68)
      ]
    };
  }

  app.captureCurrentFrame = (...args) => {
    const geometry = collectLandmarkGeometry();
    const imageData = originalCaptureCurrentFrame(...args);
    if (imageData && geometry) {
      state.junkieLandmarkSnapshot = {
        token: tailToken(imageData),
        geometry,
        capturedAt: Date.now()
      };
    }
    return imageData;
  };

  function intensityForScore(score) {
    const value = clamp(Number(score) || 0, 0, 100);
    if (value <= 30) {
      const t = value / 30;
      return { pale: 0.18 + t * 0.15, eyes: 0.035 + t * 0.075, cheeks: 0, warp: 0 };
    }
    if (value <= 60) {
      const t = (value - 30) / 30;
      return { pale: 0.38 + t * 0.24, eyes: 0.28 + t * 0.36, cheeks: 0.12 + t * 0.34, warp: 0.02 + t * 0.01 };
    }
    if (value <= 85) {
      const t = (value - 60) / 25;
      return { pale: 0.68 + t * 0.22, eyes: 0.68 + t * 0.24, cheeks: 0.58 + t * 0.26, warp: 0.04 + t * 0.01 };
    }
    const t = (value - 85) / 15;
    return { pale: 0.92 + t * 0.08, eyes: 0.94 + t * 0.06, cheeks: 0.88 + t * 0.12, warp: 0.052 + t * 0.008 };
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Zdroj JUNKIE efektu se nepovedlo načíst'));
      image.src = source;
    });
  }

  function drawCover(context, image, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;

    if (imageRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function createSource(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    drawCover(context, image, width, height);
    return canvas;
  }

  const VERTEX_SHADER = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision highp float;

    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform vec4 u_params;
    uniform vec4 u_meta;
    uniform vec4 u_face;
    uniform vec4 u_eyeL;
    uniform vec4 u_eyeR;
    uniform vec4 u_cheekL;
    uniform vec4 u_cheekR;
    uniform vec4 u_templeL;
    uniform vec4 u_templeR;
    uniform vec4 u_mouth;
    uniform vec4 u_jaw;

    varying vec2 v_uv;

    float ellipseMask(vec2 point, vec4 region, float power) {
      vec2 normalized = (point - region.xy) / max(region.zw, vec2(0.0001));
      return pow(max(0.0, 1.0 - dot(normalized, normalized)), power);
    }

    float hash21(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    vec2 horizontalInset(vec2 point, vec4 region, float faceCenterX, float amount) {
      vec2 normalized = (point - region.xy) / max(region.zw, vec2(0.0001));
      float falloff = pow(max(0.0, 1.0 - dot(normalized, normalized)), 2.4);
      float side = region.x < faceCenterX ? -1.0 : 1.0;
      point.x += side * region.z * amount * falloff;
      return point;
    }

    float crescentMask(vec2 point, vec4 region) {
      float outer = ellipseMask(point, region, 1.7);
      vec4 innerRegion = vec4(region.x, region.y - region.w * 0.42, region.z * 0.92, region.w * 0.78);
      float inner = ellipseMask(point, innerRegion, 1.5);
      return max(0.0, outer - inner * 0.82);
    }

    void main() {
      float progress = u_meta.x * u_meta.x * (3.0 - 2.0 * u_meta.x);
      float severity = u_meta.y;
      float seed = u_meta.z;
      float paleStrength = u_params.x * progress;
      float eyeStrength = u_params.y * progress;
      float cheekStrength = u_params.z * progress;
      float warpStrength = u_params.w * progress;
      vec2 point = v_uv;

      point = horizontalInset(point, u_cheekL, u_face.x, warpStrength * 0.72);
      point = horizontalInset(point, u_cheekR, u_face.x, warpStrength * 0.72);
      point = horizontalInset(point, u_templeL, u_face.x, warpStrength * 0.42);
      point = horizontalInset(point, u_templeR, u_face.x, warpStrength * 0.42);
      point = horizontalInset(point, u_eyeL, u_face.x, warpStrength * 0.22);
      point = horizontalInset(point, u_eyeR, u_face.x, warpStrength * 0.22);

      vec2 jawLocal = (v_uv - u_jaw.xy) / max(u_jaw.zw, vec2(0.0001));
      float jawMask = pow(max(0.0, 1.0 - dot(jawLocal, jawLocal)), 2.0);
      float jawSide = sign(v_uv.x - u_face.x);
      point.x += jawSide * u_face.z * warpStrength * 0.52 * jawMask;

      float eyeInsetL = ellipseMask(v_uv, vec4(u_eyeL.x, u_eyeL.y - u_eyeL.w * 0.65, u_eyeL.z, u_eyeL.w * 1.35), 2.2);
      float eyeInsetR = ellipseMask(v_uv, vec4(u_eyeR.x, u_eyeR.y - u_eyeR.w * 0.65, u_eyeR.z, u_eyeR.w * 1.35), 2.2);
      point.y -= (eyeInsetL + eyeInsetR) * warpStrength * 0.12;
      point = clamp(point, vec2(0.0015), vec2(0.9985));

      vec3 color = texture2D(u_texture, point).rgb;
      float faceMask = ellipseMask(v_uv, u_face, 2.45);
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float desaturation = mix(0.15, 0.30, paleStrength);
      color = mix(color, vec3(luminance), faceMask * desaturation * paleStrength);
      color *= 1.0 - faceMask * mix(0.025, 0.08, paleStrength) * paleStrength;
      vec3 sickMultiply = vec3(0.76, 0.83, 0.78);
      color = mix(color, color * sickMultiply, faceMask * mix(0.08, 0.12, paleStrength) * paleStrength);

      vec2 leftLocal = (v_uv - u_eyeL.xy) / max(u_eyeL.zw, vec2(0.0001));
      vec2 rightLocal = (v_uv - u_eyeR.xy) / max(u_eyeR.zw, vec2(0.0001));
      float leftInner = mix(0.76, 1.25, smoothstep(-0.7, 0.8, leftLocal.x));
      float rightInner = mix(1.25, 0.76, smoothstep(-0.8, 0.7, rightLocal.x));
      float underEyes = ellipseMask(v_uv, u_eyeL, 1.65) * leftInner + ellipseMask(v_uv, u_eyeR, 1.65) * rightInner;
      float bruiseAlpha = clamp(underEyes * eyeStrength * mix(0.34, 0.58, severity), 0.0, 0.72);
      color *= mix(vec3(1.0), vec3(0.52, 0.43, 0.56), bruiseAlpha);

      vec4 upperL = vec4(u_eyeL.x, u_eyeL.y - u_eyeL.w * 1.3, u_eyeL.z * 0.9, u_eyeL.w * 0.62);
      vec4 upperR = vec4(u_eyeR.x, u_eyeR.y - u_eyeR.w * 1.3, u_eyeR.z * 0.9, u_eyeR.w * 0.62);
      float upperShadow = ellipseMask(v_uv, upperL, 2.2) + ellipseMask(v_uv, upperR, 2.2);
      color *= 1.0 - upperShadow * eyeStrength * 0.12;

      float cheekShadow = crescentMask(v_uv, u_cheekL) + crescentMask(v_uv, u_cheekR);
      float templeShadow = ellipseMask(v_uv, u_templeL, 2.1) + ellipseMask(v_uv, u_templeR, 2.1);
      color *= mix(vec3(1.0), vec3(0.55, 0.61, 0.61), clamp(cheekShadow * cheekStrength * 0.52, 0.0, 0.62));
      color *= 1.0 - clamp(templeShadow * cheekStrength * 0.18, 0.0, 0.22);

      vec4 cheekHighlightL = vec4(u_cheekL.x, u_cheekL.y - u_cheekL.w * 0.72, u_cheekL.z * 0.88, u_cheekL.w * 0.42);
      vec4 cheekHighlightR = vec4(u_cheekR.x, u_cheekR.y - u_cheekR.w * 0.72, u_cheekR.z * 0.88, u_cheekR.w * 0.42);
      float boneHighlight = ellipseMask(v_uv, cheekHighlightL, 2.6) + ellipseMask(v_uv, cheekHighlightR, 2.6);
      color += vec3(0.05, 0.07, 0.065) * boneHighlight * cheekStrength * 0.38;

      float lipMask = ellipseMask(v_uv, u_mouth, 2.1);
      float lipLuma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(lipLuma) * vec3(0.9, 0.92, 0.9), lipMask * paleStrength * 0.34);
      float lipCrack = smoothstep(0.82, 0.97, sin((v_uv.x - u_mouth.x) * u_resolution.x * 0.48 + hash21(v_uv * 91.0 + seed) * 5.0) * 0.5 + 0.5);
      color *= 1.0 - lipMask * lipCrack * paleStrength * 0.075;

      float grain = hash21(floor(v_uv * u_resolution * 0.42) + seed * 73.0) - 0.5;
      color *= 1.0 + grain * faceMask * paleStrength * mix(0.05, 0.08, severity);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'JUNKIE shader se nepovedlo zkompilovat';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'JUNKIE GPU program se nepovedlo spojit';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  function setRegion(gl, program, name, region) {
    gl.uniform4fv(gl.getUniformLocation(program, name), new Float32Array(region));
  }

  function createGpuRenderer(canvas, source, geometry, intensity, severity, seed) {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;

    const program = createProgram(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'a_position');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
    gl.uniform4f(gl.getUniformLocation(program, 'u_params'), intensity.pale, intensity.eyes, intensity.cheeks, intensity.warp);
    setRegion(gl, program, 'u_face', geometry.face);
    setRegion(gl, program, 'u_eyeL', geometry.leftEye);
    setRegion(gl, program, 'u_eyeR', geometry.rightEye);
    setRegion(gl, program, 'u_cheekL', geometry.leftCheek);
    setRegion(gl, program, 'u_cheekR', geometry.rightCheek);
    setRegion(gl, program, 'u_templeL', geometry.leftTemple);
    setRegion(gl, program, 'u_templeR', geometry.rightTemple);
    setRegion(gl, program, 'u_mouth', geometry.mouth);
    setRegion(gl, program, 'u_jaw', geometry.jaw);
    const metaLocation = gl.getUniformLocation(program, 'u_meta');

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.04, 1);

    return {
      render(progress) {
        gl.useProgram(program);
        gl.uniform4f(metaLocation, clamp(progress, 0, 1), severity / 100, (seed % 100000) / 100000, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      finish() {
        gl.finish();
      }
    };
  }

  function ellipsePath(context, region, width, height) {
    context.beginPath();
    context.ellipse(region[0] * width, region[1] * height, region[2] * width, region[3] * height, 0, 0, Math.PI * 2);
  }

  function drawFallbackGradient(context, region, width, height, color, alpha) {
    const x = region[0] * width;
    const y = region[1] * height;
    const radius = Math.max(region[2] * width, region[3] * height);
    context.save();
    context.translate(x, y);
    context.scale(1, (region[3] * height) / Math.max(1, region[2] * width));
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, color.replace('ALPHA', String(alpha)));
    gradient.addColorStop(1, color.replace('ALPHA', '0'));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function renderFallback(canvas, source, geometry, intensity, severity, progress, seed) {
    const context = canvas.getContext('2d', { alpha: false });
    const eased = progress * progress * (3 - 2 * progress);
    const pale = intensity.pale * eased;
    const eyes = intensity.eyes * eased;
    const cheeks = intensity.cheeks * eased;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    context.save();
    ellipsePath(context, geometry.face, canvas.width, canvas.height);
    context.clip();
    context.filter = `grayscale(${Math.round(12 + pale * 18)}%) saturate(${Math.round(88 - pale * 18)}%) brightness(${Math.round(98 - pale * 6)}%)`;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    context.filter = 'none';
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgba(31, 55, 50, ${0.08 + pale * 0.04})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';

    let random = (seed % 9973) + 1;
    const randomUnit = () => {
      random = (random * 48271) % 2147483647;
      return random / 2147483647;
    };
    context.fillStyle = `rgba(9, 15, 14, ${0.018 + pale * 0.035})`;
    const noiseCount = Math.round(55 + pale * 55);
    for (let index = 0; index < noiseCount; index += 1) {
      const x = randomUnit() * canvas.width;
      const y = randomUnit() * canvas.height;
      context.fillRect(x, y, 1 + randomUnit() * 1.4, 1 + randomUnit() * 1.4);
    }
    context.restore();

    drawFallbackGradient(context, geometry.leftEye, canvas.width, canvas.height, 'rgba(58,46,62,ALPHA)', 0.12 + eyes * 0.42);
    drawFallbackGradient(context, geometry.rightEye, canvas.width, canvas.height, 'rgba(58,46,62,ALPHA)', 0.12 + eyes * 0.42);
    drawFallbackGradient(context, geometry.leftCheek, canvas.width, canvas.height, 'rgba(34,42,43,ALPHA)', cheeks * 0.34);
    drawFallbackGradient(context, geometry.rightCheek, canvas.width, canvas.height, 'rgba(34,42,43,ALPHA)', cheeks * 0.34);
    drawFallbackGradient(context, geometry.leftTemple, canvas.width, canvas.height, 'rgba(28,34,36,ALPHA)', cheeks * 0.16);
    drawFallbackGradient(context, geometry.rightTemple, canvas.width, canvas.height, 'rgba(28,34,36,ALPHA)', cheeks * 0.16);

    context.save();
    ellipsePath(context, geometry.mouth, canvas.width, canvas.height);
    context.clip();
    context.fillStyle = `rgba(104, 107, 103, ${pale * 0.14})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  function createRenderer(canvas, source, geometry, intensity, severity, seed) {
    try {
      return createGpuRenderer(canvas, source, geometry, intensity, severity, seed);
    } catch (error) {
      console.warn('JUNKIE GPU efekt není dostupný:', error);
      return null;
    }
  }

  async function animateEffect(canvas, imageData, geometry, intensity, severity, seed, runId) {
    const image = await loadImage(imageData);
    if (runId !== activeRun) return;
    canvas.width = 480;
    canvas.height = 640;
    const source = createSource(image, canvas.width, canvas.height);
    const renderer = createRenderer(canvas, source, geometry, intensity, severity, seed);
    const render = (progress) => {
      if (renderer) renderer.render(progress);
      else renderFallback(canvas, source, geometry, intensity, severity, progress, seed);
    };

    render(0);
    if (reducedMotion()) {
      render(1);
      renderer?.finish();
      return;
    }

    const started = performance.now();
    const duration = 1220;
    result.classList.add('junkie-progress');
    await new Promise((resolve) => {
      const frame = (now) => {
        if (runId !== activeRun) return resolve();
        const linear = Math.min(1, (now - started) / duration);
        render(1 - Math.pow(1 - linear, 3.1));
        if (linear < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    renderer?.finish();
    result.classList.remove('junkie-progress');
  }

  async function createFinalImage(imageData, geometry, intensity, severity, seed) {
    const image = await loadImage(imageData);
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 960;
    const source = createSource(image, canvas.width, canvas.height);
    const renderer = createRenderer(canvas, source, geometry, intensity, severity, seed);
    if (renderer) {
      renderer.render(1);
      renderer.finish();
    } else {
      renderFallback(canvas, source, geometry, intensity, severity, 1, seed);
    }
    return canvas.toDataURL('image/png');
  }

  function updateResultMetadata(visual, severity) {
    visual.classList.add('effect-junkie-forensic');
    visual.dataset.junkieTier = severity < 30 ? 'trace' : severity < 60 ? 'worn' : severity < 85 ? 'deep' : 'critical';
    const label = visual.querySelector('.effect-label');
    if (label) label.innerHTML = `<strong>${severity}%</strong>`;
    const meta = result.querySelector('.result-effect-meta strong');
    if (meta) meta.textContent = 'JUNKIE FORENSIC';
  }

  function installShareSource(visual, imageData) {
    let image = visual.querySelector('.junkie-share-source');
    if (!image) {
      image = document.createElement('img');
      image.className = 'junkie-share-source';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      visual.appendChild(image);
    }
    image.src = imageData;
  }

  function resultToken(snapshot, severity, seed) {
    return `${snapshot.token}|${Math.round(severity)}|${seed}`;
  }

  async function applyJunkieEffect() {
    if (result.classList.contains('hidden') || !state.currentImageData) return;
    const snapshot = state.junkieLandmarkSnapshot;
    if (!snapshot || snapshot.token !== tailToken(state.currentImageData)) return;

    const visual = result.querySelector('.result-visual');
    const currentMedia = visual?.querySelector('canvas, img:not(.junkie-share-source)');
    if (!visual || !currentMedia) return;

    const severity = clamp(Number(state.lastAnalysisResult?.severity || state.effectSeverity || state.visualDamageSeverity || 50), 0, 100);
    const seed = Number(state.effectSeed || state.visualDamageSeverity * 997 || Date.now() % 100000);
    const token = resultToken(snapshot, severity, seed);
    if (result.dataset.junkieToken === token) return;
    result.dataset.junkieToken = token;

    const runId = ++activeRun;
    const intensity = intensityForScore(severity);
    const canvas = document.createElement('canvas');
    canvas.className = 'warp-result-canvas junkie-result-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Forenzní satirická deformace obličeje podle skutečných landmarků. Intenzita ${Math.round(severity)} procent.`);
    currentMedia.replaceWith(canvas);
    visual.querySelector('.junkie-share-source')?.remove();
    updateResultMetadata(visual, Math.round(severity));

    state.effectProfile = PROFILE;
    state.effectSeverity = severity;
    animateEffect(canvas, state.currentImageData, snapshot.geometry, intensity, severity, seed, runId).catch((error) => {
      console.warn('Animovaný JUNKIE efekt selhal:', error);
      result.classList.remove('junkie-progress');
    });

    const basePromise = Promise.resolve(state.shareImagePromise).catch(() => undefined);
    const finalPromise = basePromise
      .then(() => createFinalImage(state.currentImageData, snapshot.geometry, intensity, severity, seed))
      .then((finalImage) => {
        if (runId !== activeRun) return finalImage;
        state.effectImageData = finalImage;
        state.effectProfile = PROFILE;
        installShareSource(visual, finalImage);
        return finalImage;
      })
      .catch((error) => {
        console.warn('Finální JUNKIE export selhal:', error);
        throw error;
      });
    state.shareImagePromise = finalPromise;
  }

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(applyJunkieEffect);
  });
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-warp-token']
  });

  applyJunkieEffect();
  window.addEventListener('pagehide', () => {
    activeRun += 1;
    observer.disconnect();
    result.classList.remove('junkie-progress');
  }, { once: true });
})();