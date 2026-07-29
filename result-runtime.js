/* Production runtime bundle: result-runtime.js | source order preserved. */

/* === face-warp.js === */
/* GPU face deformation – smooth local geometry, original pixels only. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result || !app?.elements?.canvas) return;

  const { state, elements } = app;
  const GEOMETRY_MODULE_URL = './face-warp-geometry.js?v=63';
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  let activeRun = 0;
  let geometryModulePromise = null;

  const tiers = {
    mild: [
      {
        key: 'soft-drift',
        label: 'Jemný posun proporcí',
        shape: [0.025, 0.035, 0.02, 0.012],
        flow: [0.025, 0.005, 0.018, 0.008],
        twist: 0.008
      },
      {
        key: 'late-night',
        label: 'Únava obličeje',
        shape: [-0.012, 0.025, 0.045, 0.024],
        flow: [0.012, 0.008, 0.012, 0.018],
        twist: -0.006
      },
      {
        key: 'micro-asymmetry',
        label: 'Mírná asymetrie',
        shape: [0.018, 0.04, 0.018, 0.014],
        flow: [0.018, 0.0, 0.038, 0.01],
        twist: 0.014
      }
    ],
    medium: [
      {
        key: 'facial-drift',
        label: 'Posun obličejových proporcí',
        shape: [0.045, 0.07, 0.055, 0.028],
        flow: [0.045, 0.01, 0.064, 0.026],
        twist: 0.026
      },
      {
        key: 'cheek-pressure',
        label: 'Tlak v oblasti tváří',
        shape: [0.045, 0.115, -0.025, 0.02],
        flow: [0.035, 0.015, 0.028, 0.018],
        twist: -0.016
      },
      {
        key: 'jaw-offset',
        label: 'Nestabilní čelist',
        shape: [0.018, 0.055, 0.135, 0.022],
        flow: [0.028, 0.012, 0.068, 0.035],
        twist: 0.032
      },
      {
        key: 'lens-bloom',
        label: 'Širokoúhlá deformace',
        shape: [0.095, 0.07, 0.055, 0.018],
        flow: [0.105, 0.028, 0.022, 0.016],
        twist: 0.006
      },
      {
        key: 'signal-glitch',
        label: 'Signál se láme',
        shape: [0.035, 0.09, 0.04, 0.03],
        flow: [0.16, -0.018, 0.14, 0.018],
        twist: 0.058
      },
      {
        key: 'kebab-lens',
        label: 'Kebab lens',
        shape: [0.15, 0.095, 0.03, 0.018],
        flow: [0.18, 0.038, 0.02, 0.02],
        twist: -0.018
      }
    ],
    high: [
      {
        key: 'gravity-drop',
        label: 'Gravitační pokles',
        shape: [0.055, 0.085, 0.145, 0.04],
        flow: [0.055, 0.015, 0.052, 0.095],
        twist: 0.028
      },
      {
        key: 'soft-collapse',
        label: 'Měkký kolaps proporcí',
        shape: [-0.04, -0.095, 0.105, 0.042],
        flow: [-0.085, -0.025, 0.055, 0.07],
        twist: -0.04
      },
      {
        key: 'wide-lens',
        label: 'Silná širokoúhlá deformace',
        shape: [0.13, 0.105, 0.105, 0.028],
        flow: [0.155, 0.04, 0.038, 0.042],
        twist: 0.018
      },
      {
        key: 'asymmetric-drag',
        label: 'Asymetrický tah',
        shape: [0.055, 0.095, 0.085, 0.038],
        flow: [0.055, 0.012, 0.135, 0.072],
        twist: 0.072
      },
      {
        key: 'gravity-loss',
        label: 'Ztráta gravitace',
        shape: [0.025, -0.08, 0.12, 0.065],
        flow: [-0.055, 0.075, 0.105, -0.075],
        twist: 0.045
      },
      {
        key: 'eye-sink',
        label: 'Propad očí',
        shape: [-0.055, -0.125, 0.075, 0.115],
        flow: [-0.02, 0.025, 0.055, 0.045],
        twist: -0.028
      }
    ],
    critical: [
      {
        key: 'liquid-gravity',
        label: 'Tekutá gravitace',
        shape: [0.085, 0.12, 0.18, 0.05],
        flow: [0.075, 0.02, 0.085, 0.155],
        twist: 0.052
      },
      {
        key: 'cranial-bloom',
        label: 'Kraniální přetlak',
        shape: [0.205, 0.13, -0.035, 0.035],
        flow: [0.145, 0.055, 0.055, 0.065],
        twist: -0.032
      },
      {
        key: 'deep-collapse',
        label: 'Hluboký kolaps',
        shape: [-0.085, -0.145, 0.155, 0.055],
        flow: [-0.165, -0.045, 0.09, 0.125],
        twist: -0.065
      },
      {
        key: 'total-drift',
        label: 'Totální prostorový drift',
        shape: [0.075, 0.13, 0.135, 0.045],
        flow: [0.095, 0.025, 0.175, 0.12],
        twist: 0.095
      }
    ]
  };

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
    uniform float u_progress;
    uniform float u_severity;
    uniform float u_seed;
    uniform vec4 u_shape;
    uniform vec4 u_flow;
    uniform float u_twist;
    uniform vec4 u_face;
    uniform vec4 u_forehead;
    uniform vec4 u_eyeL;
    uniform vec4 u_eyeR;
    uniform vec4 u_cheekL;
    uniform vec4 u_cheekR;
    uniform vec4 u_mouth;
    uniform vec4 u_jaw;

    varying vec2 v_uv;

    float ellipseMask(vec2 point, vec2 center, vec2 radius) {
      vec2 p = (point - center) / radius;
      float distanceSquared = dot(p, p);
      return pow(max(0.0, 1.0 - distanceSquared), 2.15);
    }

    vec2 radialWarp(vec2 point, vec2 center, vec2 radius, float amount) {
      vec2 normalized = (point - center) / radius;
      float falloff = pow(max(0.0, 1.0 - dot(normalized, normalized)), 2.25);
      return point - normalized * radius * amount * falloff;
    }

    vec2 rotateAround(vec2 point, vec2 center, float angle) {
      float sine = sin(angle);
      float cosine = cos(angle);
      vec2 local = point - center;
      return center + mat2(cosine, -sine, sine, cosine) * local;
    }

    void main() {
      float eased = u_progress * u_progress * (3.0 - 2.0 * u_progress);
      float strength = (0.34 + u_severity * 0.78) * eased;
      float seedWave = fract(sin(u_seed * 12.9898) * 43758.5453);
      vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
      vec2 center = u_face.xy;
      vec2 point = uv;

      float face = ellipseMask(uv, u_face.xy, u_face.zw);
      float lowerFace = ellipseMask(uv, u_jaw.xy, u_jaw.zw);
      float leftEye = ellipseMask(uv, u_eyeL.xy, u_eyeL.zw);
      float rightEye = ellipseMask(uv, u_eyeR.xy, u_eyeR.zw);
      float eyes = leftEye + rightEye;
      float mouth = ellipseMask(uv, u_mouth.xy, u_mouth.zw);

      point.x -= (uv.x - center.x) * u_flow.x * strength * face;
      point.y -= (uv.y - center.y) * u_flow.y * strength * face;

      point = radialWarp(point, u_forehead.xy, u_forehead.zw, u_shape.x * strength);

      float cheekDifference = 1.0 + (seedWave - 0.5) * 0.34;
      point = radialWarp(point, u_cheekL.xy, u_cheekL.zw, u_shape.y * strength * cheekDifference);
      point = radialWarp(point, u_cheekR.xy, u_cheekR.zw, u_shape.y * strength / cheekDifference);
      point = radialWarp(point, u_jaw.xy, u_jaw.zw, u_shape.z * strength);

      point.y -= u_shape.w * strength * (
        leftEye * (0.84 + seedWave * 0.16)
        + rightEye * (1.0 - seedWave * 0.16)
      );

      float organic = 0.88 + 0.12 * sin((uv.x + u_seed * 0.00013) * 12.56637);
      point.y -= u_flow.w * strength * lowerFace * organic;
      point.x -= u_flow.z * strength * face * (uv.y - center.y) * (0.75 + 0.25 * seedWave);
      point.x -= u_flow.z * strength * 0.24 * mouth * (seedWave - 0.5);

      float rotationMask = face * (0.6 + 0.4 * lowerFace);
      point = rotateAround(point, center, -u_twist * strength * rotationMask);

      point = clamp(point, vec2(0.0015), vec2(0.9985));
      gl_FragColor = texture2D(u_texture, vec2(point.x, 1.0 - point.y));
    }
  `;

  function cryptoRandom(max) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % max;
  }

  function seededUnit(seed) {
    const value = Math.sin(Number(seed || 1) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function loadGeometryModule() {
    geometryModulePromise ||= import(GEOMETRY_MODULE_URL);
    return geometryModulePromise;
  }

  function chooseProfile(_severity, _seed, preferredKey = '') {
    const profiles = Object.values(tiers).flat();
    const preferred = profiles.find((profile) => profile.key === preferredKey);
    if (preferred) return preferred;

    // Missing response metadata is intentionally visible as one documented
    // neutral fallback. The renderer never guesses an effect from severity.
    return profiles.find((profile) => profile.key === 'facial-drift');
  }

  async function geometryFor(image, width, height, faceAnalysis = state.faceAnalysis) {
    const { createWarpGeometry } = await loadGeometryModule();
    return createWarpGeometry({
      faceAnalysis,
      sourceWidth: image.naturalWidth || image.width,
      sourceHeight: image.naturalHeight || image.height,
      targetWidth: width,
      targetHeight: height
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Zdroj deformace se nepovedlo načíst'));
      image.src = source;
    });
  }

  function drawCover(context, image, x, y, width, height) {
    const imageRatio = image.width / image.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;

    if (imageRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }

    context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function createSource(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    drawCover(context, image, 0, 0, width, height);
    return canvas;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Shader se nepovedlo zkompilovat';
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
      const message = gl.getProgramInfoLog(program) || 'GPU program se nepovedlo spojit';
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }

  function setRegion(gl, program, name, value) {
    gl.uniform4fv(gl.getUniformLocation(program, name), new Float32Array(value));
  }

  function createGpuRenderer(canvas, source, profile, severity, seed, geometry) {
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
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1
      ]),
      gl.STATIC_DRAW
    );

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
    gl.uniform1f(gl.getUniformLocation(program, 'u_severity'), severity / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), seed);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_shape'), new Float32Array(profile.shape));
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flow'), new Float32Array(profile.flow));
    gl.uniform1f(gl.getUniformLocation(program, 'u_twist'), profile.twist);
    setRegion(gl, program, 'u_face', geometry.face);
    setRegion(gl, program, 'u_forehead', geometry.forehead);
    setRegion(gl, program, 'u_eyeL', geometry.leftEye);
    setRegion(gl, program, 'u_eyeR', geometry.rightEye);
    setRegion(gl, program, 'u_cheekL', geometry.leftCheek);
    setRegion(gl, program, 'u_cheekR', geometry.rightCheek);
    setRegion(gl, program, 'u_mouth', geometry.mouth);
    setRegion(gl, program, 'u_jaw', geometry.jaw);
    const progressLocation = gl.getUniformLocation(program, 'u_progress');

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.01, 0.03, 0.08, 1);

    return {
      render(progress) {
        gl.useProgram(program);
        gl.uniform1f(progressLocation, Math.max(0, Math.min(1, progress)));
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      finish() {
        gl.finish();
      },
      destroy() {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
    };
  }

  function ellipsePath(context, region, width, height) {
    context.beginPath();
    context.ellipse(
      region[0] * width,
      region[1] * height,
      region[2] * width,
      region[3] * height,
      0,
      0,
      Math.PI * 2
    );
  }

  function drawRegionWarp(
    context,
    source,
    region,
    {
      scaleX = 1,
      scaleY = 1,
      translateX = 0,
      translateY = 0,
      rotation = 0
    } = {}
  ) {
    const width = source.width;
    const height = source.height;
    const centerX = region[0] * width;
    const centerY = region[1] * height;
    context.save();
    ellipsePath(context, region, width, height);
    context.clip();
    context.translate(centerX + translateX * width, centerY + translateY * height);
    context.rotate(rotation);
    context.scale(
      clamp(scaleX, 0.76, 1.28),
      clamp(scaleY, 0.76, 1.32)
    );
    context.translate(-centerX, -centerY);
    context.drawImage(source, 0, 0, width, height);
    context.restore();
  }

  function renderFallback(canvas, source, profile, severity, progress, geometry, seed) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    const eased = progress * progress * (3 - 2 * progress);
    const strength = (0.3 + severity / 100 * 0.55) * eased;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    drawRegionWarp(context, source, geometry.face, {
      scaleX: 1 + profile.flow[0] * strength,
      scaleY: 1 + profile.flow[1] * strength,
      translateX: profile.flow[2] * strength * 0.08,
      translateY: profile.flow[3] * strength * 0.08,
      rotation: -profile.twist * strength * 0.42
    });
    drawRegionWarp(context, source, geometry.forehead, {
      scaleX: 1 + profile.shape[0] * strength,
      scaleY: 1 + profile.shape[0] * strength * 0.55
    });

    const cheekBias = 1 + ((seededUnit(seed) * 2 - 1) * 0.17);
    drawRegionWarp(context, source, geometry.leftCheek, {
      scaleX: 1 + profile.shape[1] * strength * cheekBias,
      scaleY: 1 + profile.shape[1] * strength * 0.58
    });
    drawRegionWarp(context, source, geometry.rightCheek, {
      scaleX: 1 + profile.shape[1] * strength / cheekBias,
      scaleY: 1 + profile.shape[1] * strength * 0.58
    });
    drawRegionWarp(context, source, geometry.jaw, {
      scaleX: 1 + profile.shape[2] * strength,
      scaleY: 1 + profile.shape[2] * strength * 0.55,
      translateX: profile.flow[2] * strength * 0.1,
      translateY: profile.flow[3] * strength * 0.18,
      rotation: -profile.twist * strength * 0.7
    });
    drawRegionWarp(context, source, geometry.leftEye, {
      translateY: -profile.shape[3] * strength * 0.14
    });
    drawRegionWarp(context, source, geometry.rightEye, {
      translateY: -profile.shape[3] * strength * 0.11
    });
    drawRegionWarp(context, source, geometry.mouth, {
      translateX: profile.flow[2] * strength * 0.06,
      translateY: profile.flow[3] * strength * 0.08,
      rotation: -profile.twist * strength * 0.5
    });
  }

  async function animateCanvas(canvas, imageData, profile, severity, seed, runId, faceAnalysis) {
    const image = await loadImage(imageData);
    if (runId !== activeRun) {
      image.removeAttribute('src');
      return;
    }

    canvas.width = 480;
    canvas.height = 640;
    const source = createSource(image, canvas.width, canvas.height);
    const geometry = await geometryFor(image, canvas.width, canvas.height, faceAnalysis);
    image.removeAttribute('src');
    if (runId !== activeRun) return;
    canvas.dataset.warpAnchored = String(geometry.anchored);
    let renderer = null;

    try {
      renderer = createGpuRenderer(canvas, source, profile, severity, seed, geometry);
    } catch (error) {
      console.warn('GPU deformace není dostupná:', error);
    }
    canvas.dataset.warpRenderer = renderer ? 'webgl' : 'canvas';

    const render = (progress) => {
      if (renderer) renderer.render(progress);
      else renderFallback(canvas, source, profile, severity, progress, geometry, seed);
    };

    render(0);
    if (reducedMotion()) {
      render(1);
      renderer?.finish();
      renderer?.destroy();
      return;
    }

    const started = performance.now();
    const duration = 1220;
    elements.result.classList.add('warp-progress');

    await new Promise((resolve) => {
      const frame = (now) => {
        if (runId !== activeRun) return resolve();
        const linear = Math.min(1, (now - started) / duration);
        const cinematic = 1 - Math.pow(1 - linear, 3.2);
        render(cinematic);
        if (linear < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    renderer?.finish();
    renderer?.destroy();
    elements.result.classList.remove('warp-progress');
  }

  async function renderFaceEffect({
    imageData,
    severity = 50,
    effect = '',
    faceAnalysis = state.faceAnalysis,
    seed = cryptoRandom(100000) + 1,
    output = { width: 720, height: 960, crop: 'cover' }
  }) {
    if (!imageData) throw new Error('Zdroj deformace chybí');
    const image = await loadImage(imageData);
    const width = clamp(Math.round(Number(output?.width) || 720), 120, 1440);
    const height = clamp(Math.round(Number(output?.height) || 960), 160, 1920);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const source = createSource(image, width, height);
    const geometry = await geometryFor(image, width, height, faceAnalysis);
    image.removeAttribute('src');
    const numericSeverity = Number(severity);
    const safeSeverity = clamp(Number.isFinite(numericSeverity) ? numericSeverity : 50, 0, 100);
    const numericSeed = Number(seed);
    const safeSeed = Number.isFinite(numericSeed) && numericSeed > 0
      ? numericSeed
      : cryptoRandom(100000) + 1;
    const preferredKey = typeof effect === 'string' ? effect : effect?.key;
    const profile = chooseProfile(safeSeverity, safeSeed, preferredKey);

    let renderer = null;
    try {
      renderer = createGpuRenderer(canvas, source, profile, safeSeverity, safeSeed, geometry);
    } catch (error) {
      console.warn('GPU export není dostupný:', error);
    }

    if (renderer) {
      renderer.render(1);
      renderer.finish();
      renderer.destroy();
    } else {
      renderFallback(canvas, source, profile, safeSeverity, 1, geometry, safeSeed);
    }

    const finalDataUrl = canvas.toDataURL('image/png');
    return {
      previewDataUrl: finalDataUrl,
      finalDataUrl,
      renderer: renderer ? 'webgl' : 'canvas',
      effect: profile.key,
      label: profile.label,
      seed: safeSeed,
      anchored: geometry.anchored,
      crop: 'cover'
    };
  }

  async function createFinalImage(imageData, profile, severity, seed, faceAnalysis) {
    const rendered = await renderFaceEffect({
      imageData,
      severity,
      effect: profile.key,
      faceAnalysis,
      seed,
      output: { width: 720, height: 960, crop: 'cover' }
    });
    return rendered.finalDataUrl;
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });

    if (line) lines.push(line);
    const visible = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,!?…]*$/, '')}…`;
    }
    visible.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  }

  async function drawShareCard(imageData, title, description, severity, profile) {
    const image = await loadImage(imageData);
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');
    const width = 1080;
    const imageHeight = 900;
    const panelHeight = 450;
    canvas.width = width;
    canvas.height = imageHeight + panelHeight;

    const background = context.createLinearGradient(0, 0, width, canvas.height);
    background.addColorStop(0, '#0f172a');
    background.addColorStop(0.55, '#071426');
    background.addColorStop(1, '#020617');
    context.fillStyle = background;
    context.fillRect(0, 0, width, canvas.height);
    drawCover(context, image, 0, 0, width, imageHeight);

    const vignette = context.createRadialGradient(width / 2, imageHeight * 0.44, 120, width / 2, imageHeight * 0.46, 680);
    vignette.addColorStop(0, 'rgba(2, 6, 23, 0)');
    vignette.addColorStop(1, 'rgba(2, 6, 23, 0.42)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, imageHeight);

    context.fillStyle = 'rgba(2,6,23,0.76)';
    context.fillRect(42, 42, 580, 62);
    context.fillStyle = '#67e8f9';
    context.font = '800 24px ui-monospace, monospace';
    context.textAlign = 'left';
    context.fillText(`SMŽK / ${profile.key.toUpperCase()} / DAMAGE ${severity}%`, 64, 82);

    context.fillStyle = 'rgba(2,6,23,0.97)';
    context.fillRect(0, imageHeight, width, panelHeight);
    const accent = context.createLinearGradient(0, imageHeight, width, imageHeight);
    accent.addColorStop(0, '#22d3ee');
    accent.addColorStop(1, '#34d399');
    context.fillStyle = accent;
    context.fillRect(0, imageHeight, width, 8);

    context.textAlign = 'center';
    context.fillStyle = '#67e8f9';
    context.font = '700 28px ui-sans-serif, sans-serif';
    context.fillText('LOKÁLNÍ AI DETEKCE DEVASTACE', width / 2, imageHeight + 58);

    context.fillStyle = '#fff';
    let titleSize = 66;
    context.font = `800 ${titleSize}px ui-sans-serif, sans-serif`;
    while (context.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      context.font = `800 ${titleSize}px ui-sans-serif, sans-serif`;
    }
    context.fillText(title, width / 2, imageHeight + 145);

    context.fillStyle = '#d9e1df';
    context.font = 'italic 38px ui-sans-serif, sans-serif';
    wrapText(context, description, width / 2, imageHeight + 220, width - 130, 48, 3);

    context.fillStyle = 'rgba(217,225,223,0.5)';
    context.font = '28px ui-sans-serif, sans-serif';
    context.fillText('jsemsmazka.cz • jen pro srandu, ne diagnóza', width / 2, imageHeight + panelHeight - 52);
  }

  function resultToken() {
    const title = state.lastAnalysisResult?.title || '';
    const severity = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50);
    const imageTail = String(state.currentImageData || '').slice(-32);
    return `${title}|${severity}|${imageTail}`;
  }

  async function upgradeResult() {
    if (elements.result.classList.contains('hidden') || !state.currentImageData) return;
    const token = resultToken();
    if (elements.result.dataset.warpToken === token) return;
    const visual = elements.result.querySelector('.result-visual');
    if (!visual) return;
    const oldMedia = visual.querySelector('img, canvas');
    if (!oldMedia) return;
    elements.result.dataset.warpToken = token;

    const runId = ++activeRun;
    const severity = Math.max(12, Math.min(98, Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50)));
    const preparedSeed = visual.querySelector('img') ? Number(state.effectSeed) : 0;
    const seed = preparedSeed > 0 ? preparedSeed : cryptoRandom(100000) + 1;
    const profile = chooseProfile(severity, seed, state.lastAnalysisResult?.effectProfile?.key || state.effectProfile?.key);
    const faceAnalysis = state.faceAnalysis;

    visual.className = `result-visual effect-${profile.key}`;
    visual.style.setProperty('--effect-strength', String(severity / 100));
    visual.dataset.landmarkWarp = faceAnalysis?.anchors ? 'anchored' : 'fallback';

    const canvas = document.createElement('canvas');
    canvas.className = 'warp-result-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Plynule deformovaný původní obličej. Intenzita efektu ${severity} procent.`);
    oldMedia?.replaceWith(canvas);

    const label = visual.querySelector('.effect-label');
    if (label) label.innerHTML = `<span>${profile.label}</span><strong>${severity}%</strong>`;

    state.effectSeverity = severity;
    state.effectProfile = profile;
    state.effectSeed = seed;

    animateCanvas(
      canvas,
      state.currentImageData,
      profile,
      severity,
      seed,
      runId,
      faceAnalysis
    ).catch((error) => {
      console.warn('Animovaná deformace selhala:', error);
    });

    state.shareImagePromise = createFinalImage(
      state.currentImageData,
      profile,
      severity,
      seed,
      faceAnalysis
    )
      .then(async (finalImage) => {
        if (runId !== activeRun) return;
        state.effectImageData = finalImage;
        await drawShareCard(
          finalImage,
          state.lastAnalysisResult?.title || 'Neznámý stav',
          state.lastAnalysisResult?.description || '',
          severity,
          profile
        );
      })
      .catch((error) => {
        console.warn('Příprava deformovaného PNG selhala:', error);
      });
  }

  window.SmazkaFaceWarp = Object.freeze({
    renderFaceEffect
  });

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(() => requestAnimationFrame(upgradeResult));
  observer.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  upgradeResult();
})();

/* === hard-responses.js === */
/* Adds the optional harder result pack after the main response library is ready. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state) return;

  const mergeHardResponses = async () => {
    try {
      const response = await fetch('responses-hard.json?v=64', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const hardResponses = await response.json();
      if (!Array.isArray(hardResponses) || hardResponses.length === 0) return;

      let attempts = 0;
      const mergeWhenReady = () => {
        attempts += 1;
        const library = app.state.responseLibrary;
        if (!Array.isArray(library) || library.length < 4) {
          if (attempts < 30) window.setTimeout(mergeWhenReady, 100);
          return;
        }

        const known = new Set(library.map((item) => `${item.category}|${item.description}`));
        hardResponses.forEach((item) => {
          const key = `${item?.category}|${item?.description}`;
          if (item?.category && item?.description && !known.has(key)) {
            library.push(item);
            known.add(key);
          }
        });
      };

      mergeWhenReady();
    } catch (error) {
      console.warn('Tvrdší balíček hlášek se nepovedlo načíst:', error);
    }
  };

  mergeHardResponses();
})();

/* === junky-verdict-engine.js === */
/* Junky Verdict Engine v75. Metadata-driven local satire; not medical or drug-use detection. */
(() => {
  'use strict';
  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements || typeof app.runAnalysis !== 'function') return;

  const { state, elements } = app;
  const originalRunAnalysis = app.runAnalysis.bind(app);
  const PACK_URL = 'responses-pernik.json?v=64';
  const MATCHER_URL = './verdict-matcher.js?v=64';
  const RECENT_LIMIT = 5;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tierFor = (score) => score < 35 ? 'low' : score < 58 ? 'worn' : score < 78 ? 'junky' : 'critical';
  let engineBusy = false;
  let packPromise;
  let matcherPromise;
  let microcopyQueued = false;
  let metadataWarningIssued = false;

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomUnit() {
    if (!window.crypto?.getRandomValues) return Math.random();
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] / 0xffffffff;
  }

  function normalizeDevastationMetrics(metrics) {
    if (!metrics || typeof metrics !== 'object') return null;

    const apertura = Number(metrics.apertura);
    const lidskost = Number(metrics.lidskost);
    const gravitace = Number(metrics.gravitace);
    const hydratace = Number(metrics.hydratace);
    const asymetrie = String(metrics.asymetrie || '').trim().toLocaleLowerCase('cs-CZ');

    if (
      !Number.isFinite(apertura)
      || !Number.isFinite(lidskost)
      || !Number.isFinite(gravitace)
      || !Number.isFinite(hydratace)
      || !['nízká', 'střední', 'vysoká'].includes(asymetrie)
    ) return null;

    return Object.freeze({
      apertura: clamp(apertura, 0, 100),
      lidskost: clamp(lidskost, 0, 100),
      gravitace: clamp(gravitace, 0, 45),
      asymetrie,
      hydratace: clamp(hydratace, 0, 100)
    });
  }

  function normalizeFaceAnalysis(faceAnalysis, metrics) {
    if (!faceAnalysis || typeof faceAnalysis !== 'object' || !metrics) return null;
    if (!Array.isArray(faceAnalysis.normalizedLandmarks) || faceAnalysis.normalizedLandmarks.length < 468) {
      return null;
    }
    return faceAnalysis;
  }

  function loadMatcher() {
    matcherPromise ||= import(MATCHER_URL);
    return matcherPromise;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Obrázek se nepovedlo dekódovat'));
      image.src = source;
    });
  }

  function drawCover(context, image, width, height) {
    const imageRatio = image.width / image.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function pointDistance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function landmarkSignals() {
    const points = new Map();
    document.querySelectorAll('.face-landmark-mesh circle.landmark').forEach((circle) => {
      if (circle.hidden) return;
      const index = Number(circle.dataset.index);
      const x = Number(circle.getAttribute('cx'));
      const y = Number(circle.getAttribute('cy'));
      if (Number.isFinite(index) && Number.isFinite(x) && Number.isFinite(y)) points.set(index, { x, y });
    });
    if (points.size < 8) return null;

    const rightWidth = pointDistance(points.get(33), points.get(133));
    const leftWidth = pointDistance(points.get(263), points.get(362));
    const rightOpen = rightWidth ? pointDistance(points.get(159), points.get(145)) / rightWidth : 0.2;
    const leftOpen = leftWidth ? pointDistance(points.get(386), points.get(374)) / leftWidth : 0.2;
    const eyeOpen = (rightOpen + leftOpen) / 2;
    const eyeAsymmetry = Math.abs(rightOpen - leftOpen) / Math.max(0.04, eyeOpen);
    const rightCenter = { x: ((points.get(33)?.x || 0) + (points.get(133)?.x || 0)) / 2, y: ((points.get(33)?.y || 0) + (points.get(133)?.y || 0)) / 2 };
    const leftCenter = { x: ((points.get(263)?.x || 0) + (points.get(362)?.x || 0)) / 2, y: ((points.get(263)?.y || 0) + (points.get(362)?.y || 0)) / 2 };
    const eyeDistance = pointDistance(rightCenter, leftCenter);
    const mouthWidth = pointDistance(points.get(61), points.get(291));

    return {
      sleepy: clamp((0.22 - eyeOpen) / 0.14, 0, 1),
      asymmetry: clamp(eyeAsymmetry / 0.8, 0, 1),
      tilt: clamp((eyeDistance ? Math.abs(rightCenter.y - leftCenter.y) / eyeDistance : 0) / 0.16, 0, 1),
      mouth: clamp((mouthWidth ? pointDistance(points.get(13), points.get(14)) / mouthWidth : 0) / 0.22, 0, 1)
    };
  }

  async function computeSeverity(imageData) {
    const image = await loadImage(imageData);
    const width = 96;
    const height = 112;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    drawCover(context, image, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luma = new Float32Array(width * height);
    let sum = 0;
    let squares = 0;
    let saturation = 0;
    let dark = 0;
    let highlights = 0;
    let red = 0;
    let left = 0;
    let right = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = (y * width + x) * 4;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        const value = r * 0.2126 + g * 0.7152 + b * 0.0722;
        luma[y * width + x] = value;
        sum += value;
        squares += value * value;
        saturation += Math.max(r, g, b) - Math.min(r, g, b);
        if (value < 58) dark += 1;
        if (value > 218) highlights += 1;
        red += Math.max(0, r - (g + b) / 2);
        if (x < width / 2) left += value;
        else right += value;
      }
    }

    let edge = 0;
    let edgeCount = 0;
    for (let y = 1; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        const current = luma[y * width + x];
        edge += Math.abs(current - luma[y * width + x - 1]);
        edge += Math.abs(current - luma[(y - 1) * width + x]);
        edgeCount += 2;
      }
    }

    const count = width * height;
    const mean = sum / count;
    const deviation = Math.sqrt(Math.max(0, squares / count - mean * mean));
    const signals = landmarkSignals();
    let score = 23;
    score += clamp((deviation - 28) / 52, 0, 1) * 15;
    score += clamp((dark / count) / 0.42, 0, 1) * 15;
    score += clamp((highlights / count) / 0.32, 0, 1) * 4;
    score += clamp((saturation / count - 24) / 78, 0, 1) * 6;
    score += clamp((red / count - 3) / 24, 0, 1) * 8;
    score += clamp(Math.abs(left - right) / (count / 2) / 34, 0, 1) * 10;
    score += clamp((17 - edge / edgeCount) / 17, 0, 1) * 7;
    if (signals) score += signals.sleepy * 11 + signals.asymmetry * 8 + signals.tilt * 6 + signals.mouth * 4;
    score += ((hashText(String(imageData).slice(-320)) % 1001) / 1000 - 0.5) * 10;
    return clamp(Math.round(score), 16, 94);
  }

  async function waitForStableLibrary(timeout = 2200) {
    const started = performance.now();
    let previous = -1;
    let stable = 0;
    while (performance.now() - started < timeout) {
      const length = Array.isArray(state.responseLibrary) ? state.responseLibrary.length : 0;
      stable = length >= 4 && length === previous ? stable + 1 : 0;
      if (stable >= 3) return;
      previous = length;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function loadPack() {
    if (packPromise) return packPromise;
    packPromise = (async () => {
      try {
        const response = await fetch(PACK_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pack = await response.json();
        if (!Array.isArray(pack)) throw new Error('Perníkovej pack nemá správný formát');
        await waitForStableLibrary();
        const known = new Set(state.responseLibrary.map((item) => `${item.category}|${item.description}`));
        pack.forEach((item) => {
          const key = `${item?.category}|${item?.description}`;
          if (item?.category && item?.description && !known.has(key)) {
            state.responseLibrary.push(item);
            known.add(key);
          }
        });
      } catch (error) {
        console.warn('Perníkovej hardcore pack se nepovedlo načíst:', error);
      }
    })();
    return packPromise;
  }

  async function runTieredAnalysis(options = {}) {
    if (engineBusy || state.isAnalyzing) return;
    if (!state.currentImageData && !options.skipImageCheck) {
      app.showError('Nejdřív dodej ksicht. Bez důkazního materiálu perníkovej tribunál jen čumí do zdi.');
      return;
    }
    engineBusy = true;
    app.setBusy(true);
    elements.loading?.classList.remove('hidden');
    app.setHint('Toxikologický algoritmus počítá tiky a zbytky lidskosti…');
    try {
      await loadPack();
      await waitForStableLibrary(900);
      const metrics = normalizeDevastationMetrics(options.faceAnalysis?.metrics || options.metrics);
      const faceAnalysis = normalizeFaceAnalysis(options.faceAnalysis, metrics);
      let severity;

      if (metrics) {
        const measuredSeverity = Number(faceAnalysis?.scores?.severity);
        severity = Number.isFinite(measuredSeverity)
          ? clamp(Math.round(measuredSeverity), 12, 98)
          : clamp(Math.round(100 - metrics.lidskost), 16, 94);
      } else {
        severity = await computeSeverity(state.currentImageData).catch((error) => {
          console.warn('Vizuální damage skóre selhalo, používám fallback:', error);
          return 36 + (hashText(String(state.currentImageData).slice(-220)) % 48);
        });
      }

      const {
        hasValidResponseMetadata,
        selectVerdictByMetadata
      } = await loadMatcher();
      const responses = Array.from(state.responseLibrary || [])
        .filter((item) => item?.category && item?.description);
      const invalidMetadata = responses.filter((item) => !hasValidResponseMetadata(item));
      if (invalidMetadata.length && !metadataWarningIssued) {
        metadataWarningIssued = true;
        console.warn(
          `Přeskakuju ${invalidMetadata.length} verdiktů bez explicitních severity/effect/signals metadat.`,
          invalidMetadata.map((item) => item.id || item.category)
        );
      }
      const recent = Array.isArray(state.junkyRecentCategories)
        ? state.junkyRecentCategories
        : [];
      const selected = selectVerdictByMetadata({
        severity,
        signals: faceAnalysis?.signals,
        metrics,
        responses,
        recentCategories: recent,
        random: randomUnit
      });
      if (!selected) throw new Error('Knihovna verdiktů je prázdná');
      state.junkyRecentCategories = [
        ...new Set([selected.category, ...recent])
      ].slice(0, RECENT_LIMIT);

      const selectedFaceAnalysis = faceAnalysis
        ? {
            ...faceAnalysis,
            selection: {
              responseId: selected.id || '',
              category: selected.category,
              severity,
              severityRange: { ...selected.severity },
              effect: selected.effect,
              signals: [...selected.signals]
            }
          }
        : null;
      state.visualDamageSeverity = severity;
      state.visualDamageTier = tierFor(severity);
      state.lastDevastationMetrics = metrics;
      state.faceAnalysis = selectedFaceAnalysis;
      app.setBusy(false);
      originalRunAnalysis({
        ...options,
        severity,
        verdict: selected,
        faceAnalysis: selectedFaceAnalysis
      });
    } finally {
      engineBusy = false;
      if (!state.isAnalyzing) app.setBusy(false);
    }
  }

  async function optimizeUpload(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Nahraj obrázek, ne dokument');
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Soubor se nepovedlo přečíst'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const image = await loadImage(source);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  async function interceptUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    elements.uploadButton.disabled = true;
    elements.analyzeButton.disabled = true;
    try {
      const imageData = await optimizeUpload(file);
      app.setCurrentImageData(imageData);
      app.showCapturedFrame();
      elements.captureButton.classList.add('hidden');
      elements.retakeButton.classList.remove('hidden');
      elements.analyzeButton.classList.remove('hidden');
      app.hideResult();
      app.clearErrors();
      if (typeof window.SmazkaFaceScan?.analyzeStillImage !== 'function') {
        throw new Error('MediaPipe modul pro nahranou fotku není dostupný.');
      }
      const faceAnalysis = await window.SmazkaFaceScan.analyzeStillImage(imageData);
      await runTieredAnalysis({
        metrics: faceAnalysis.metrics,
        faceAnalysis
      });
    } catch (error) {
      if (error?.code) console.warn('Perníkovej upload odmítl vstup:', error);
      else console.error('Perníkovej upload se nepovedl:', error);
      app.showError(
        error?.code
          ? error.message
          : 'Fotka se nepovedla změřit. Zkus jinou, tahle odmítla vypovídat.'
      );
      app.setHint('Pro biometrický verdikt potřebuju jednu jasnou tvář.');
    } finally {
      event.target.value = '';
      if (!state.isAnalyzing) {
        elements.uploadButton.disabled = false;
        elements.analyzeButton.disabled = false;
      }
    }
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function replaceExact(element, replacements) {
    if (!element) return;
    const value = replacements[element.textContent.trim()];
    if (value) setText(element, value);
  }

  function polishMicrocopy() {
    microcopyQueued = false;
    replaceExact(elements.scanHint, {
      'VOID engine pitvá obraz a hledá zbytky člověka…': 'Toxikologický algoritmus počítá tiky a zbytky lidskosti…',
      'Podsvětí tiskne rozsudek přímo do ksichtu…': 'Perníkovej tribunál tiskne rozsudek přímo do ksichtu…',
      'Rozsudek je venku. Sdílej ostudu, nebo přiveď další subjekt.': 'Rozsudek venku. Sdílej důkazní materiál, nebo přiveď další trosku.'
    });
    replaceExact(document.querySelector('.scan-state-copy'), {
      'Zamykám subjekt': 'Zamykám obličejovej důkaz',
      'Oči nalezeny • soudnost ne': 'Zorničky nalezeny • člověk ne',
      'Nos a ústa pod dohledem': 'Čelist a nos na výslechu',
      'Kontura trosek hotová': 'Perníkovej profil uzamčen',
      'Vážím zbytky důstojnosti': 'Počítám tiky a cizí zapalovače',
      'Rozpad potvrzen': 'Biologická reklamace potvrzena'
    });

    const reveal = document.querySelector('.result-reveal-title');
    if (reveal && state.visualDamageTier) setText(reveal, {
      low: 'Podezřele funkční', worn: 'Čelist na přesčase', junky: 'Perníkovej rozpad potvrzen', critical: 'Člověk nenalezen'
    }[state.visualDamageTier]);

    const details = elements.result.querySelector('.in-frame-details-label');
    if (details) setText(details, elements.result.classList.contains('details-open') ? 'Skrýt toxikologický protokol' : 'Otevřít toxikologický protokol');
    const heading = elements.result.querySelector('.diagnostic-heading');
    if (heading) {
      setText(heading.querySelector('strong'), 'TOXIKOLOGICKÝ PROTOKOL');
      setText(heading.querySelector('small'), 'VOID LAB · 100% nevědecký');
    }
    const labels = {
      'Stabilita zorniček': 'Zorničky pod dohledem',
      'Kontakt s realitou': 'Signál z planety Země',
      'Koordinace pohybu': 'Schopnost dojít bez svědků',
      'Pravděpodobnost příchodu domů': 'Šance poznat vlastní adresu',
      'Riziko ztráty klíčů': 'Klíče už mají nového majitele',
      'Zbytková důstojnost': 'Zbytková lidskost',
      'Mozkový ping': 'Odezva posledního neuronu'
    };
    elements.result.querySelectorAll('.diagnostic-copy span').forEach((label) => replaceExact(label, labels));
    elements.result.querySelectorAll('.result-tool-button span').forEach((label) => replaceExact(label, {
      'Jiná deformace': 'Jiný efekt',
      'Ještě víc mě znič': 'Dorazit zbytky'
    }));
    if (!elements.result.classList.contains('hidden')) {
      if (elements.result.dataset.verdictTier !== (state.visualDamageTier || 'worn')) elements.result.dataset.verdictTier = state.visualDamageTier || 'worn';
      const score = String(state.visualDamageSeverity || '');
      if (elements.result.dataset.visualDamage !== score) elements.result.dataset.visualDamage = score;
    }
  }

  function queuePolish() {
    if (microcopyQueued) return;
    microcopyQueued = true;
    window.queueMicrotask(polishMicrocopy);
  }

  app.runAnalysis = runTieredAnalysis;
  elements.uploadInput.addEventListener('change', interceptUpload, true);
  elements.analyzeButton.addEventListener('click', (event) => {
    if (window.SmazkaFaceScan?.start) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runTieredAnalysis();
  }, true);

  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(queuePolish);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  loadPack();
  queuePolish();
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();

/* === experience-upgrades.js === */
/* Smažka Scan experience upgrades – local-only, no external dependencies. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements?.result || !app?.state) return;

  const { elements, state } = app;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let resultRun = 0;
  let extraDamage = 0;
  let diagnosisTimer = null;

  const secondaryDiagnoses = [
    'Levá půlka obličeje už odešla domů. Pravá pořád čeká na poslední spoj.',
    'Mozek se pokusil restartovat, ale našel jen popelník a tři cizí vzpomínky.',
    'Čelist hlásí přesčas. Zuby mezitím rozjely vlastní afterparty.',
    'Důstojnost byla naposledy zachycena včera ve 23:17. Další stopa není.',
    'Systém našel zbytky soudnosti. Byly označeny jako nebezpečný odpad.',
    'Oči jedou každá jinou směnu a nos odmítá vypovídat bez advokáta.',
    'Tělo je online, majitel účtu se ale dlouhodobě nepřihlásil.',
    'Obličej byl sestaven z náhradních dílů po zavírací době.',
    'V hlavě běží nouzový generátor. Palivo: paranoia a poslední cigáro.',
    'Dodatečný nález: duše zaparkovaná na zákazu stání před nonstopem.',
    'Paměť je plná. Všechny soubory mají název final_final_opravdu_final.',
    'Krevní skupina nezjištěna. Vzorek odpovídá energetáku s popelem.',
    'Mimika se odpojila od serveru. Obličej pokračuje v offline režimu.',
    'Čelo dorazilo první, zbytek obličeje nabral zpoždění dvě zastávky.',
    'Diagnostika dokončena: hardware přežil, software se odstěhoval.',
    'Soudnost nalezena mrtvá. Hlavní podezřelý se právě fotí přední kamerou.',
    'Ksicht byl označen za černou stavbu. Demolice už zřejmě začala zevnitř.',
    'Zornice odmítají test na drogy i základní geometrii. Každá tvrdí jiný průměr.',
    'Mozek odeslal automatickou odpověď: dnes nejsem v kanceláři, zkuste jiného člověka.',
    'Důstojnost dosáhla záporných hodnot. Měřák se omluvil a odešel z profese.',
    'Na obličeji probíhá neohlášená technická odstávka. Náhradní člověk není k dispozici.',
    'Detekována cizí mikina, tři špatná rozhodnutí a sebevědomí bez jakéhokoli právního základu.',
    'Výraz odpovídá člověku, který našel smysl života a okamžitě ho ztratil u šatny.'
  ];

  const extraProfiles = [
    { key: 'widescreen', label: 'Obličej v režimu širokoúhlý peklo', rows: true, amount: 0.46 },
    { key: 'jawdrop', label: 'Čelist vytažená z kolejí', rows: true, amount: 0.58 },
    { key: 'forehead', label: 'Čelo po developerským projektu', rows: true, amount: 0.5 },
    { key: 'sidepull', label: 'Ksicht tažený k nonstopu', rows: true, amount: 0.38 },
    { key: 'accordion', label: 'Junky harmonika', rows: true, amount: 0.42 },
    { key: 'spiral', label: 'Obličej zamotanej do vlastní směny', columns: true, amount: 0.32 },
    { key: 'liquid', label: 'Tekutá pracovní morálka', columns: true, amount: 0.48 },
    { key: 'implosion', label: 'Ksicht po vnitřním výbuchu', rows: true, amount: -0.34 }
  ];

  function randomIndex(length) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * length);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % length;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Deformovaný snímek se nepovedlo načíst'));
      image.src = source;
    });
  }

  function canvasToDataUrl(canvas) {
    return canvas.toDataURL('image/png');
  }

  function copyCanvas(source) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  }

  function applyRowWarp(source, output, profile, progress, seed) {
    const width = output.width;
    const height = output.height;
    const context = output.getContext('2d');
    const strip = 4;
    context.clearRect(0, 0, width, height);

    for (let y = 0; y < height; y += strip) {
      const v = y / height;
      const face = Math.exp(-Math.pow((v - 0.46) / 0.34, 2));
      const forehead = Math.exp(-Math.pow((v - 0.27) / 0.17, 2));
      const jaw = Math.exp(-Math.pow((v - 0.66) / 0.18, 2));
      let mask = face;
      let amount = profile.amount * progress * (0.7 + extraDamage * 0.08);
      let shift = 0;

      if (profile.key === 'forehead') mask = forehead;
      if (profile.key === 'jawdrop') mask = jaw;
      if (profile.key === 'accordion') amount *= Math.sin(y * 0.075 + seed) * 0.85;
      if (profile.key === 'sidepull') shift = Math.sin(v * Math.PI) * width * amount * 0.34;
      if (profile.key === 'implosion') amount = Math.max(-0.52, amount);

      const drawWidth = width * Math.max(0.5, 1 + amount * mask);
      const wobble = Math.sin(y * 0.035 + seed * 0.1) * width * 0.028 * progress * face;
      const dx = (width - drawWidth) / 2 + wobble + shift;
      context.drawImage(source, 0, y, width, Math.min(strip + 1, height - y), dx, y, drawWidth, Math.min(strip + 1, height - y));
    }
  }

  function applyColumnWarp(source, output, profile, progress, seed) {
    const width = output.width;
    const height = output.height;
    const context = output.getContext('2d');
    const strip = 4;
    context.clearRect(0, 0, width, height);

    for (let x = 0; x < width; x += strip) {
      const n = (x - width / 2) / (width * 0.42);
      const mask = Math.pow(Math.max(0, 1 - n * n), 1.3);
      const random = 0.38 + ((Math.sin((x + seed) * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.62;
      const pull = height * profile.amount * progress * mask * random * (0.56 + extraDamage * 0.08);
      const sway = profile.key === 'spiral'
        ? Math.sin(x * 0.04 + seed) * width * 0.035 * progress * mask
        : Math.sin(x * 0.025 + seed) * width * 0.012 * progress * mask;
      context.drawImage(source, x, 0, Math.min(strip + 1, width - x), height, x + sway, 0, Math.min(strip + 1, width - x), height + pull);
    }
  }

  async function animateExtraWarp(canvas, profile, runId) {
    const source = copyCanvas(canvas);
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const duration = reducedMotion() ? 1 : 820;
    const started = performance.now();

    elements.result.classList.add('extra-warp-progress');

    await new Promise((resolve) => {
      const frame = (now) => {
        if (runId !== resultRun) return resolve();
        const progress = reducedMotion() ? 1 : Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (profile.columns) applyColumnWarp(source, output, profile, eased, runId * 17.3);
        else applyRowWarp(source, output, profile, eased, runId * 17.3);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        canvas.getContext('2d').drawImage(output, 0, 0);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    elements.result.classList.remove('extra-warp-progress');
    return canvasToDataUrl(canvas);
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    const visible = lines.slice(0, maxLines);
    if (lines.length > maxLines && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.,!?…]*$/, '')}…`;
    visible.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  }

  async function rebuildShareCard(imageData) {
    const image = await loadImage(imageData);
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');
    const width = 1080;
    const imageHeight = 900;
    const panelHeight = 450;
    canvas.width = width;
    canvas.height = imageHeight + panelHeight;

    const imageRatio = image.width / image.height;
    const targetRatio = width / imageHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, imageHeight);

    context.fillStyle = 'rgba(2,6,23,0.95)';
    context.fillRect(0, imageHeight, width, panelHeight);
    const accent = context.createLinearGradient(0, imageHeight, width, imageHeight);
    accent.addColorStop(0, '#22d3ee');
    accent.addColorStop(1, '#34d399');
    context.fillStyle = accent;
    context.fillRect(0, imageHeight, width, 8);

    const title = state.lastAnalysisResult?.title || 'Neznámý stav';
    const description = state.lastAnalysisResult?.description || '';
    const severity = Math.min(100, Number(state.effectSeverity || state.lastAnalysisResult?.severity || 50) + extraDamage * 7);

    context.textAlign = 'center';
    context.fillStyle = '#67e8f9';
    context.font = '700 28px ui-sans-serif, sans-serif';
    context.fillText(`LOKÁLNÍ DETEKCE DEVASTACE • DAMAGE ${severity}%`, width / 2, imageHeight + 58);
    context.fillStyle = '#fff';
    let titleSize = 66;
    context.font = `900 ${titleSize}px ui-sans-serif, sans-serif`;
    while (context.measureText(title).width > width - 96 && titleSize > 38) {
      titleSize -= 2;
      context.font = `900 ${titleSize}px ui-sans-serif, sans-serif`;
    }
    context.fillText(title, width / 2, imageHeight + 145);
    context.fillStyle = '#d9e1df';
    context.font = 'italic 38px ui-sans-serif, sans-serif';
    wrapText(context, description, width / 2, imageHeight + 220, width - 130, 48, 3);
    context.fillStyle = 'rgba(217,225,223,0.5)';
    context.font = '28px ui-sans-serif, sans-serif';
    context.fillText('jsemsmazka.cz • černý humor, ne diagnóza', width / 2, imageHeight + panelHeight - 52);
  }

  function updateDamageLabel(profile) {
    const label = elements.result.querySelector('.effect-label');
    const severity = Math.min(100, Number(state.effectSeverity || state.lastAnalysisResult?.severity || 50) + extraDamage * 7);
    if (label) label.innerHTML = `<span>${profile.label}</span><strong>${severity}%</strong>`;
    state.effectSeverity = severity;
  }

  async function destroyMore(button) {
    const canvas = elements.result.querySelector('.warp-result-canvas');
    if (!canvas || button.disabled) return;
    button.disabled = true;
    extraDamage = Math.min(5, extraDamage + 1);
    const profile = extraProfiles[randomIndex(extraProfiles.length)];
    const runId = ++resultRun;
    updateDamageLabel(profile);

    try {
      const finalImage = await animateExtraWarp(canvas, profile, runId);
      state.effectImageData = finalImage;
      state.shareImagePromise = rebuildShareCard(finalImage);
      await state.shareImagePromise;
      button.querySelector('span:last-child').textContent = extraDamage >= 5 ? 'Totální konečná' : 'Ještě víc mě znič';
      button.disabled = extraDamage >= 5;
    } catch (error) {
      console.warn('Další destrukce obličeje selhala:', error);
      button.disabled = false;
    }
  }

  function addDestroyButton() {
    const actions = elements.result.querySelector('.result-actions');
    if (!actions || actions.querySelector('.destroy-more-button')) return;
    const button = document.createElement('button');
    button.className = 'destroy-more-button';
    button.type = 'button';
    button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span>Ještě víc mě znič</span>';
    button.addEventListener('click', () => destroyMore(button));
    const newScan = actions.querySelector('.new-scan-button');
    actions.insertBefore(button, newScan || null);
  }

  function showSecondaryDiagnosis(token) {
    clearTimeout(diagnosisTimer);
    diagnosisTimer = window.setTimeout(() => {
      if (token !== resultRun || elements.result.classList.contains('hidden')) return;
      const panel = elements.result.querySelector('.diagnostic-panel');
      if (!panel || panel.querySelector('.secondary-diagnosis')) return;
      const box = document.createElement('aside');
      box.className = 'secondary-diagnosis';
      box.innerHTML = `<strong>⚠️ DODATEČNÝ NÁLEZ</strong><p>${secondaryDiagnoses[randomIndex(secondaryDiagnoses.length)]}</p>`;
      panel.appendChild(box);
    }, reducedMotion() ? 250 : 1750);
  }

  function addWarpMeter() {
    const visual = elements.result.querySelector('.result-visual');
    if (!visual || visual.querySelector('.warp-meter')) return;
    const meter = document.createElement('div');
    meter.className = 'warp-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = '<span>DEFORMACE</span><strong>0%</strong><i></i>';
    visual.appendChild(meter);
  }

  function resetForResult() {
    if (elements.result.classList.contains('hidden')) return;
    const visual = elements.result.querySelector('.result-visual');
    if (!visual) return;
    const signature = `${state.lastAnalysisResult?.title || ''}|${String(state.currentImageData || '').slice(-20)}`;
    if (elements.result.dataset.experienceSignature === signature) return;
    elements.result.dataset.experienceSignature = signature;
    extraDamage = 0;
    resultRun += 1;
    addDestroyButton();
    addWarpMeter();
    showSecondaryDiagnosis(resultRun);
  }

  const resultObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => requestAnimationFrame(resetForResult));
  resultObserver.observe(elements.result, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const scanBar = document.querySelector('#scanBar .scan-bar-fill');
  const scanStatus = document.getElementById('scanStatus');
  if (scanBar) {
    const scanObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
      const width = Math.max(0, Math.min(100, Number.parseFloat(scanBar.style.width) || 0));
      document.documentElement.style.setProperty('--scan-progress', `${width}%`);
      if (scanStatus) scanStatus.dataset.progress = `${Math.round(width)}%`;
    });
    scanObserver.observe(scanBar, { attributes: true, attributeFilter: ['style'] });
  }

  resetForResult();
})();

/* === diagnostic-upgrades.js === */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) return;

  const { state, elements } = app;
  const STORAGE = {
    privacy: 'smazka:auto-clear-photo',
    sound: 'smazka:sound-enabled'
  };

  let audioContext = null;
  let lastResultToken = '';
  let resultWasVisible = false;
  let updateRegistration = null;
  let reloadForUpdate = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isHidden = (element) => !element || element.classList.contains('hidden');

  function readSetting(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : stored === 'true';
    } catch {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, String(Boolean(value)));
    } catch {
      // Private browsing can reject storage. The current session still works.
    }
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seeded(seed, offset = 0) {
    const value = Math.sin((seed + offset * 101.37) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function resultToken() {
    const title = state.lastAnalysisResult?.title || '';
    const severity = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50);
    const imageTail = String(state.currentImageData || '').slice(-36);
    return `${title}|${severity}|${imageTail}`;
  }

  function createDiagnostics(token, severity) {
    const seed = hashText(token);
    const jitter = (offset, amplitude) => Math.round((seeded(seed, offset) - 0.5) * amplitude * 2);
    const pupils = clamp(Math.round(92 - severity * 0.86 + jitter(1, 10)), 2, 96);
    const home = clamp(Math.round(96 - severity * 0.94 + jitter(2, 12)), 1, 98);
    const coordination = clamp(Math.round(94 - severity * 0.91 + jitter(3, 11)), 1, 97);
    const keys = clamp(Math.round(8 + severity * 0.9 + jitter(4, 10)), 3, 99);
    const ping = clamp(Math.round(75 + severity * 9.7 + seeded(seed, 5) * 210), 90, 1240);

    const reality = severity < 28
      ? 'podezřele stabilní'
      : severity < 50
        ? 'lehce mimo osu'
        : severity < 72
          ? 'nestabilní'
          : severity < 88
            ? 'kritický'
            : 'spojení přerušeno';

    const dignity = severity < 32
      ? 'ještě dohledatelná'
      : severity < 58
        ? 'na posledních 12 %'
        : severity < 80
          ? 'v nedohlednu'
          : 'nenalezena';

    return [
      { label: 'Stabilita zorniček', value: `${pupils} %`, score: pupils },
      { label: 'Kontakt s realitou', value: reality, score: clamp(100 - severity, 3, 96) },
      { label: 'Koordinace pohybu', value: `${coordination} %`, score: coordination },
      { label: 'Pravděpodobnost příchodu domů', value: `${home} %`, score: home },
      { label: 'Riziko ztráty klíčů', value: `${keys} %`, score: keys, danger: true },
      { label: 'Zbytková důstojnost', value: dignity, score: clamp(100 - severity * 1.08, 0, 94) },
      { label: 'Mozkový ping', value: `${ping} ms${severity >= 74 ? '+' : ''}`, score: clamp(100 - ping / 13, 4, 82), danger: true }
    ];
  }

  function getAudioContext() {
    if (!readSetting(STORAGE.sound, true)) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => undefined);
    return audioContext;
  }

  function tone(frequency, startDelay, duration, volume = 0.035, type = 'sine') {
    const context = getAudioContext();
    if (!context) return;

    const startsAt = context.currentTime + startDelay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  function playScanStart() {
    tone(210, 0, 0.08, 0.025, 'triangle');
    tone(310, 0.1, 0.07, 0.028, 'triangle');
    tone(460, 0.21, 0.09, 0.03, 'sine');
  }

  function playResultReveal(severity = 50) {
    tone(430, 0, 0.08, 0.028, 'sine');
    tone(620, 0.09, 0.09, 0.032, 'triangle');
    tone(severity >= 75 ? 118 : 820, 0.2, severity >= 75 ? 0.16 : 0.12, 0.035, severity >= 75 ? 'sawtooth' : 'sine');
  }

  function playReroll() {
    tone(540, 0, 0.07, 0.027, 'square');
    tone(380, 0.08, 0.07, 0.024, 'square');
    tone(690, 0.17, 0.1, 0.03, 'triangle');
  }

  function vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Vibrate API is intentionally optional, especially on iOS.
    }
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return false;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  function extensionFor(dataUrl) {
    if (String(dataUrl).startsWith('data:image/png')) return 'png';
    if (String(dataUrl).startsWith('data:image/webp')) return 'webp';
    return 'jpg';
  }

  async function saveOriginal(button) {
    const source = state.currentImageData;
    if (!source) return app.showError('Původní fotka už byla bezpečně smazána.');
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Ukládám…';
    downloadDataUrl(source, `smazka-original-${Date.now()}.${extensionFor(source)}`);
    vibrate(20);
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = previous;
    }, 450);
  }

  async function saveDeformed(button) {
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Připravuju…';

    try {
      await Promise.resolve(state.shareImagePromise).catch(() => undefined);
      const source = state.effectImageData;
      if (!source) throw new Error('Deformovaný obrázek zatím není připravený');
      downloadDataUrl(source, `smazka-deformace-${Date.now()}.png`);
      vibrate([18, 35, 24]);
      button.textContent = 'Uloženo ✓';
    } catch (error) {
      console.warn('Uložení deformace selhalo:', error);
      app.showError('Deformovaný obrázek se nepovedlo uložit. Zkus to ještě jednou.');
      button.textContent = 'Zkusit znovu';
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = previous;
      }, 900);
    }
  }

  function waitFor(predicate, timeout = 900) {
    const started = performance.now();
    return new Promise((resolve) => {
      const inspect = () => {
        if (predicate()) return resolve(true);
        if (performance.now() - started >= timeout) return resolve(false);
        requestAnimationFrame(inspect);
      };
      inspect();
    });
  }

  async function refreshWarp(previousKey, previousSeed, attempt = 0) {
    elements.result.removeAttribute('data-warp-token');
    elements.result.classList.toggle('diagnostic-warp-refresh');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    elements.result.classList.toggle('diagnostic-warp-refresh');

    await waitFor(() => state.effectSeed && state.effectSeed !== previousSeed, 1100);
    const currentKey = state.effectProfile?.key || '';
    if (currentKey && currentKey === previousKey && attempt < 3) {
      return refreshWarp(currentKey, state.effectSeed, attempt + 1);
    }

    await Promise.resolve(state.shareImagePromise).catch(() => undefined);
    return true;
  }

  async function rerollDeformation(button) {
    if (!state.currentImageData) return app.showError('Fotka už není dostupná. Spusť nový sken.');

    const previousMarkup = button.innerHTML;
    const previousKey = state.effectProfile?.key || '';
    const previousSeed = state.effectSeed;
    button.disabled = true;
    const label = button.querySelector('span');
    if (label) label.textContent = 'Přepočítávám…';
    playReroll();
    vibrate([14, 28, 14]);

    try {
      await refreshWarp(previousKey, previousSeed);
      if (label) label.textContent = 'Jiný efekt ✓';
    } catch (error) {
      console.warn('Přegenerování deformace selhalo:', error);
      app.showError('Jiný efekt se teď nepovedl. Zkus to znovu.');
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.innerHTML = previousMarkup;
      }, 650);
    }
  }

  function buildDiagnostics(diagnostics) {
    const section = document.createElement('section');
    section.className = 'diagnostic-panel';
    section.setAttribute('aria-label', 'Satirický toxikologický protokol');

    const heading = document.createElement('div');
    heading.className = 'diagnostic-heading';
    heading.innerHTML = '<span class="diagnostic-pulse" aria-hidden="true"></span><div><strong>TOXIKOLOGICKÝ PROTOKOL</strong><small>VOID LAB · 100% nevědecký</small></div>';

    const list = document.createElement('div');
    list.className = 'diagnostic-list';

    diagnostics.forEach((item, index) => {
      const row = document.createElement('div');
      const score = clamp(item.score, 2, 100);
      const tier = score >= 82 ? 'critical' : score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
      row.className = `diagnostic-row is-${tier}${item.danger ? ' is-danger' : ''}`;
      row.dataset.score = String(score);
      if (String(item.value).length > 17) row.classList.add('is-long-value');
      row.style.setProperty('--diagnostic-delay', `${index * 75}ms`);

      const copy = document.createElement('div');
      copy.className = 'diagnostic-copy';
      const label = document.createElement('span');
      label.textContent = item.label;
      const value = document.createElement('strong');
      value.textContent = item.value;
      copy.append(label, value);

      const meter = document.createElement('span');
      meter.className = 'diagnostic-meter';
      meter.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('i');
      fill.style.setProperty('--diagnostic-score', `${score}%`);
      meter.appendChild(fill);

      row.append(copy, meter);
      list.appendChild(row);
    });

    section.append(heading, list);
    return section;
  }

  function buildEffectRerollButton() {
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'effect-reroll-button';
    reroll.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-switch"></use></svg><span>Jiný efekt</span>';
    reroll.addEventListener('click', () => rerollDeformation(reroll));
    return reroll;
  }

  function buildToolButtons() {
    const grid = document.createElement('div');
    grid.className = 'result-tool-grid';

    const saveGroup = document.createElement('div');
    saveGroup.className = 'save-choice';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'result-tool-button result-save-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-download"></use></svg><span>Uložit…</span><i aria-hidden="true">⌄</i>';

    const menu = document.createElement('div');
    menu.className = 'save-choice-menu';
    menu.hidden = true;

    const saveOriginalButton = document.createElement('button');
    saveOriginalButton.type = 'button';
    saveOriginalButton.className = 'result-tool-button save-choice-button';
    saveOriginalButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-photo"></use></svg><span>Uložit originál</span>';
    saveOriginalButton.addEventListener('click', () => saveOriginal(saveOriginalButton));

    const saveWarpButton = document.createElement('button');
    saveWarpButton.type = 'button';
    saveWarpButton.className = 'result-tool-button save-choice-button';
    saveWarpButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-download"></use></svg><span>Uložit deformaci</span>';
    saveWarpButton.addEventListener('click', () => saveDeformed(saveWarpButton));

    toggle.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      saveGroup.classList.toggle('is-open', open);
    });

    menu.append(saveOriginalButton, saveWarpButton);
    saveGroup.append(toggle, menu);
    grid.append(saveGroup);
    return grid;
  }

  function decorateResult() {
    if (isHidden(elements.result) || !state.currentImageData) return;
    const content = elements.result.querySelector('.result-content');
    const description = content?.querySelector('.description');
    const actions = content?.querySelector('.result-actions');
    if (!content || !description || !actions) return;

    const token = resultToken();
    if (elements.result.dataset.diagnosticToken === token) return;
    elements.result.dataset.diagnosticToken = token;

    const severity = clamp(Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50), 12, 98);
    const diagnostics = createDiagnostics(token, severity);
    state.diagnosticData = diagnostics;

    content.querySelector('.diagnostic-panel')?.remove();
    content.querySelector('.result-tool-grid')?.remove();
    content.querySelector('.effect-reroll-button')?.remove();
    description.insertAdjacentElement('afterend', buildDiagnostics(diagnostics));
    description.insertAdjacentElement('beforebegin', buildEffectRerollButton());
    actions.insertAdjacentElement('beforebegin', buildToolButtons());

    if (token !== lastResultToken) {
      lastResultToken = token;
      playResultReveal(severity);
      vibrate(severity >= 75 ? [24, 45, 34, 60, 42] : [18, 45, 26]);
    }
  }

  function installSettings() {
    const footer = document.querySelector('footer');
    if (!footer || document.getElementById('privacyModeToggle')) return;

    const panel = document.createElement('section');
    panel.className = 'local-settings';
    panel.setAttribute('aria-label', 'Nastavení soukromí a zvuku');

    const privacyLabel = document.createElement('label');
    privacyLabel.className = 'setting-row';
    privacyLabel.innerHTML = '<span><strong>Bezpečný režim</strong><small>Po zavření výsledku odstraní fotku z paměti.</small></span>';
    const privacyToggle = document.createElement('input');
    privacyToggle.id = 'privacyModeToggle';
    privacyToggle.type = 'checkbox';
    privacyToggle.checked = readSetting(STORAGE.privacy, true);
    privacyToggle.addEventListener('change', () => writeSetting(STORAGE.privacy, privacyToggle.checked));
    privacyLabel.appendChild(privacyToggle);

    const soundLabel = document.createElement('label');
    soundLabel.className = 'setting-row';
    soundLabel.innerHTML = '<span><strong>Zvuky skeneru</strong><small>Krátká lokální pípnutí, žádné audio soubory.</small></span>';
    const soundToggle = document.createElement('input');
    soundToggle.id = 'soundModeToggle';
    soundToggle.type = 'checkbox';
    soundToggle.checked = readSetting(STORAGE.sound, true);
    soundToggle.addEventListener('change', () => {
      writeSetting(STORAGE.sound, soundToggle.checked);
      if (soundToggle.checked) tone(620, 0, 0.08, 0.025, 'sine');
    });
    soundLabel.appendChild(soundToggle);

    panel.append(privacyLabel, soundLabel);
    footer.prepend(panel);
  }

  function clearPrivatePhoto() {
    if (!readSetting(STORAGE.privacy, true) || !state.currentImageData) return;
    app.clearCurrentImage();
    state.diagnosticData = null;
    elements.result.removeAttribute('data-diagnostic-token');
    elements.result.removeAttribute('data-warp-token');
    elements.retakeButton?.classList.add('hidden');
    elements.analyzeButton?.classList.remove('hidden');
    app.setHint('Bezpečný režim fotku odstranil. Pro další výsledek spusť nový sken.');
  }

  function showUpdateBanner(registration) {
    if (document.getElementById('appUpdateBanner')) return;
    updateRegistration = registration;

    const banner = document.createElement('aside');
    banner.id = 'appUpdateBanner';
    banner.className = 'app-update-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<div><strong>Nová verze je připravená</strong><span>Aktualizace proběhne bez ztráty nastavení.</span></div>';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Aktualizovat';
    button.addEventListener('click', () => {
      const worker = updateRegistration?.waiting;
      if (!worker) return;
      reloadForUpdate = true;
      button.disabled = true;
      button.textContent = 'Aktualizuji…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    });

    banner.appendChild(button);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));
  }

  async function watchServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadForUpdate) return;
        reloadForUpdate = false;
        location.reload();
      });

      registration.update().catch(() => undefined);
    } catch (error) {
      console.warn('Kontrola aktualizace není dostupná:', error);
    }
  }

  elements.analyzeButton?.addEventListener('pointerdown', () => {
    getAudioContext();
    playScanStart();
    vibrate([16, 50, 18, 105, 24]);
  }, { capture: true });

  elements.uploadButton?.addEventListener('pointerdown', () => {
    getAudioContext();
    tone(280, 0, 0.07, 0.022, 'triangle');
    vibrate(16);
  }, { capture: true });

  elements.uploadInput?.addEventListener('change', () => {
    playScanStart();
    vibrate([16, 55, 22]);
  });

  const resultObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    const visible = !isHidden(elements.result);
    if (visible) decorateResult();
    if (resultWasVisible && !visible) window.setTimeout(clearPrivatePhoto, 0);
    resultWasVisible = visible;
  });

  resultObserver.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  installSettings();
  watchServiceWorkerUpdates();
  decorateResult();

  window.SmazkaDiagnostics = {
    rerollDeformation,
    clearPrivatePhoto,
    createDiagnostics
  };

  window.addEventListener('pagehide', () => resultObserver.disconnect(), { once: true });
})();
