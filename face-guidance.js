/* Smažka v48 — local face positioning guidance plus stable mobile hero focus. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const stage = app?.elements?.cameraStage || document.getElementById('cameraStage');
  const hint = app?.elements?.scanHint || document.getElementById('scanHint');
  const loading = app?.elements?.loading || document.getElementById('loading');
  if (!stage || !hint) return;

  const SAMPLE_INTERVAL = 150;
  const STABLE_SAMPLES = 3;
  const HERO_RELEASE_DELAY = 650;
  const EYE_GROUPS = {
    right: [33, 133, 159, 145],
    left: [263, 362, 386, 374]
  };

  let animationFrame = 0;
  let lastSampleAt = 0;
  let pendingKey = '';
  let pendingCount = 0;
  let appliedKey = '';
  let heroReleaseTimer = 0;

  function setHeroEngaged(engaged, { immediate = false } = {}) {
    if (engaged) {
      window.clearTimeout(heroReleaseTimer);
      heroReleaseTimer = 0;
      document.body.classList.add('face-guidance-engaged');
      return;
    }

    const release = () => {
      heroReleaseTimer = 0;
      document.body.classList.remove('face-guidance-engaged');
    };

    if (immediate) {
      window.clearTimeout(heroReleaseTimer);
      release();
      return;
    }

    if (!heroReleaseTimer) {
      heroReleaseTimer = window.setTimeout(release, HERO_RELEASE_DELAY);
    }
  }

  function visiblePoint(index) {
    const node = stage.querySelector(`.face-landmark-mesh .landmark[data-index="${index}"]`);
    if (!node || node.hidden) return null;
    const x = Number.parseFloat(node.getAttribute('cx'));
    const y = Number.parseFloat(node.getAttribute('cy'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function averagePoint(indices) {
    const points = indices.map(visiblePoint).filter(Boolean);
    if (!points.length) return null;
    const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  function visibleLandmarks() {
    return Array.from(stage.querySelectorAll('.face-landmark-mesh .landmark'))
      .filter((node) => !node.hidden)
      .map((node) => ({
        x: Number.parseFloat(node.getAttribute('cx')),
        y: Number.parseFloat(node.getAttribute('cy'))
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function geometry() {
    const points = visibleLandmarks();
    if (points.length < 8 || !stage.clientWidth || !stage.clientHeight) return null;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rightEye = averagePoint(EYE_GROUPS.right);
    const leftEye = averagePoint(EYE_GROUPS.left);
    const eyeAngle = rightEye && leftEye
      ? Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x)
      : 0;

    return {
      widthRatio: (maxX - minX) / stage.clientWidth,
      heightRatio: (maxY - minY) / stage.clientHeight,
      centerX: ((minX + maxX) / 2) / stage.clientWidth,
      centerY: ((minY + maxY) / 2) / stage.clientHeight,
      eyeAngle
    };
  }

  function guidanceForFace(face) {
    if (face.widthRatio < 0.3 || face.heightRatio < 0.32) {
      return { key: 'closer', state: 'adjust', message: 'Přibliž obličej ke kameře.' };
    }
    if (face.widthRatio > 0.76 || face.heightRatio > 0.78) {
      return { key: 'farther', state: 'adjust', message: 'Ustup trochu od kamery.' };
    }
    if (face.centerX < 0.41) {
      return { key: 'right', state: 'adjust', message: 'Posuň obličej doprava.' };
    }
    if (face.centerX > 0.59) {
      return { key: 'left', state: 'adjust', message: 'Posuň obličej doleva.' };
    }
    if (face.centerY < 0.37) {
      return { key: 'down', state: 'adjust', message: 'Posuň obličej níž.' };
    }
    if (face.centerY > 0.63) {
      return { key: 'up', state: 'adjust', message: 'Posuň obličej výš.' };
    }
    if (Math.abs(face.eyeAngle) > 0.13) {
      return { key: 'level', state: 'adjust', message: 'Narovnej hlavu.' };
    }
    return { key: 'ready', state: 'ready', message: 'Obličej je správně. Spusť sken.' };
  }

  function scannerBusy(overlay) {
    return Boolean(
      document.body.classList.contains('face-scan-active')
      || overlay?.classList.contains('is-scanning')
      || overlay?.dataset.stage === 'complete'
      || (loading && !loading.classList.contains('hidden'))
    );
  }

  function clearGuidance({ keepHero = false, immediate = false } = {}) {
    pendingKey = '';
    pendingCount = 0;
    appliedKey = '';
    stage.removeAttribute('data-guidance');
    hint.removeAttribute('data-guidance');
    if (!keepHero) setHeroEngaged(false, { immediate });
  }

  function applyGuidance(next) {
    if (next.key !== pendingKey) {
      pendingKey = next.key;
      pendingCount = 1;
      return;
    }

    pendingCount += 1;
    if (pendingCount < STABLE_SAMPLES || appliedKey === next.key) return;

    appliedKey = next.key;
    stage.dataset.guidance = next.state;
    hint.dataset.guidance = next.state;
    hint.textContent = next.message;
    setHeroEngaged(true);
  }

  function showSearchState() {
    pendingKey = 'search';
    pendingCount = STABLE_SAMPLES;
    setHeroEngaged(false);
    if (appliedKey === 'search') return;
    appliedKey = 'search';
    stage.dataset.guidance = 'search';
    hint.dataset.guidance = 'search';
    hint.textContent = 'Obličej doprostřed.';
  }

  function sample(now) {
    animationFrame = window.requestAnimationFrame(sample);
    if (document.hidden || now - lastSampleAt < SAMPLE_INTERVAL) return;
    lastSampleAt = now;

    const overlay = document.getElementById('scanOverlay');
    const busy = scannerBusy(overlay);
    const unavailable = !stage.classList.contains('is-live')
      || stage.classList.contains('has-preview')
      || stage.classList.contains('has-camera-error')
      || busy;

    if (unavailable) {
      const preserveHero = busy || (
        stage.classList.contains('has-preview')
        && document.body.classList.contains('face-guidance-engaged')
      );
      clearGuidance({ keepHero: preserveHero });
      if (preserveHero) setHeroEngaged(true);
      return;
    }

    const face = geometry();
    if (!face || !overlay?.classList.contains('face-detected')) {
      showSearchState();
      return;
    }

    applyGuidance(guidanceForFace(face));
  }

  animationFrame = window.requestAnimationFrame(sample);

  window.addEventListener('pagehide', () => {
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(heroReleaseTimer);
    clearGuidance({ immediate: true });
  }, { once: true });
})();