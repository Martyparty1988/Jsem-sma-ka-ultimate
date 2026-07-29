/* Smažka v81 — editable Junkie Vision theme, copy and timing. */
(() => {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  const theme = {
    version: 81,
    name: 'Junkie Vision / WARNA',
    colors: {
      toxic: '#00FF66',
      impact: '#FF0055',
      warning: '#FFCC00',
      white: '#F4FFF8',
      void: '#020604',
      panel: 'rgba(2, 8, 6, 0.78)'
    },
    timing: {
      totalMs: 3000,
      initEndMs: 1000,
      scanEndMs: 2500,
      criticalEndMs: 3000,
      exitMs: 320,
      metricRotateMs: 340,
      hapticAtMs: [120, 1040, 2520]
    },
    performance: {
      targetFps: 30,
      maxDevicePixelRatio: 1.5,
      maxMeshConnections: 460,
      connectionStride: 3,
      scanlineStep: 5
    },
    labels: {
      init: 'SYSTEM INIT: WARNA READY',
      tracking: 'BIOMETRIC LOCK // 468 POINTS',
      scanning: 'JUNKIE VISION // TISSUE SWEEP',
      critical: 'CRITICAL IMPACT DETECTED',
      footer: 'LOCAL VOID LAB // MEME, NOT DIAGNOSIS'
    },
    metrics: [
      { label: 'ANALÝZA ROZTĚKANOSTI ZRNKA', kind: 'scatter', suffix: '% (KRITICKÁ)' },
      { label: 'DETEKCE POKLESU VÍČEK', kind: 'droop', suffix: 'm/s² (SMRT)' },
      { label: 'SKEN ČELISTNÍHO STISKU', kind: 'jaw', suffix: '' },
      { label: 'HYDRATACE TKÁNĚ', kind: 'hydration', suffix: '% (SUCHÝ JAK VÝPEX)' },
      { label: 'ASOMETRIE KOUTKŮ', kind: 'mouth', suffix: '' },
      { label: 'SYNTÉZA PERNÍKOVÉHO INDEXU', kind: 'pernik', suffix: '' },
      { label: 'HLADINA PARANOI', kind: 'paranoia', suffix: '' },
      { label: 'STAV ZORNIC', kind: 'pupils', suffix: '' },
      { label: 'KONTAKT S REALITOU', kind: 'reality', suffix: '' },
      { label: 'ZBYTKOVÁ LIDSKOST', kind: 'humanity', suffix: '% (NEOVĚŘENO)' },
      { label: 'MOZKOVÝ PING', kind: 'ping', suffix: 'ms+' },
      { label: 'STABILITA SIGNÁLU', kind: 'signal', suffix: '% / KOLAPS' }
    ],
    zoneIndices: {
      rightEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
      leftEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
      mouth: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
      faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
      forehead: [10, 151, 9, 8]
    }
  };

  window.SmazkaJunkieHudTheme = deepFreeze(theme);
})();
