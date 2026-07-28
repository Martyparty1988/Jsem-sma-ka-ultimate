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

  function chooseProfile(severity, seed, preferredKey = '') {
    if (preferredKey) {
      const preferred = Object.values(tiers)
        .flat()
        .find((profile) => profile.key === preferredKey);
      if (preferred) return preferred;
    }

    const tier = severity < 30 ? tiers.mild : severity < 58 ? tiers.medium : severity < 82 ? tiers.high : tiers.critical;
    return tier[Math.abs(seed) % tier.length];
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

  const observer = new MutationObserver(() => requestAnimationFrame(upgradeResult));
  observer.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  upgradeResult();
})();
