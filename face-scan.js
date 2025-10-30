/* Face Scan Mode (no photo capture) */
(function(){
  const video = document.getElementById('video');
  const captureButton = document.getElementById('captureButton');
  const uploadButton = document.getElementById('uploadButton');
  const retakeButton = document.getElementById('retakeButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const resultDiv = document.getElementById('result');
  const previewContainer = document.getElementById('previewContainer');
  const generalError = document.getElementById('generalError');
  const loadingDiv = document.getElementById('loading');

  // Build overlay UI
  const overlay = document.createElement('div');
  overlay.id = 'scanOverlay';
  overlay.style.cssText = 'position: absolute; inset: 0; pointer-events:none; border-radius: 16px;';

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';
  scanLine.style.cssText = 'position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#22d3ee,transparent);opacity:0;';

  const faceBox = document.createElement('div');
  faceBox.id = 'faceBox';
  faceBox.style.cssText = 'position:absolute;border:2px solid #22d3ee;border-radius:12px;box-shadow:0 0 18px rgba(34,211,238,.4);opacity:0;';

  const status = document.createElement('div');
  status.id = 'scanStatus';
  status.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:-44px;color:#7dd3fc;font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,.5)';
  status.textContent = 'Inicializace kamery…';

  const barWrap = document.createElement('div');
  barWrap.id = 'scanBar';
  barWrap.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:-78px;width:220px;height:6px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;opacity:0;';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:100%;width:0;background:linear-gradient(90deg,#22d3ee,#34d399);transition:width .1s';
  barWrap.appendChild(bar);

  const videoContainer = document.querySelector('.video-container');
  if (videoContainer) {
    videoContainer.style.position = 'relative';
    overlay.appendChild(scanLine);
    overlay.appendChild(faceBox);
    overlay.appendChild(status);
    overlay.appendChild(barWrap);
    videoContainer.appendChild(overlay);
  }

  // Darker, cooler theme accents via CSS vars if present
  const style = document.createElement('style');
  style.textContent = `
    .camera-section { background: radial-gradient(1200px 500px at 50% -20%, rgba(34,197,94,.06), transparent), #0b1220; }
    .video-container { border:1px solid rgba(148,163,184,.15); box-shadow: 0 10px 30px rgba(2,6,23,.6), inset 0 0 0 1px rgba(255,255,255,.04); border-radius:16px; overflow:hidden; }
    #video { object-fit: cover; }
    @keyframes scanY { from{ top:0% } to{ top:100% } }
    #scanLine.active { opacity:1; animation: scanY 1.8s linear infinite; }
    #faceBox.show { opacity:1; transition: opacity .25s, transform .25s; }
  `;
  document.head.appendChild(style);

  // Hide photo workflow, show analyze only
  function enableFaceScanUI(){
    captureButton.classList.add('hidden');
    uploadButton.classList.add('hidden');
    analyzeButton.classList.remove('hidden');
    retakeButton.classList.add('hidden');
    previewContainer.classList.add('hidden');
    resultDiv.classList.add('hidden');
    generalError.classList.add('hidden');
  }

  // Lightweight simulated face detection + progress
  let progress = 0; let scanTimer = null; let detectTimer = null;
  function startFaceScan(){
    enableFaceScanUI();
    status.textContent = 'Hledám obličej…';
    scanLine.classList.add('active');

    // Simulate face lock after 0.8-1.6s
    detectTimer = setTimeout(()=>{
      // center 60% of the frame
      const vc = videoContainer.getBoundingClientRect();
      const w = Math.min(vc.width*0.5, 360);
      const h = Math.min(vc.height*0.5, 360);
      const x = (vc.width - w)/2; const y = (vc.height - h)/2;
      Object.assign(faceBox.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
      faceBox.classList.add('show');
      status.textContent = 'Obličej detekován! Skenuji…';
      barWrap.style.opacity = '1';
      progress = 0;
      scanTimer = setInterval(()=>{
        progress += 5 + Math.random()*5; // 5-10%
        if(progress>100) progress=100;
        bar.style.width = progress+'%';
        if(progress>=100){
          finishScan();
        }
      },120);
    }, 800 + Math.random()*800);
  }

  function finishScan(){
    clearInterval(scanTimer);
    scanLine.classList.remove('active');
    status.textContent = 'Dokončeno!';
    setTimeout(()=>{
      // Trigger existing analyze flow but without image
      loadingDiv.classList.remove('hidden');
      // Reuse existing runAnalysis if available
      if(typeof runAnalysis === 'function'){
        runAnalysis();
      }
      // Reset UI bits after kick-off
      faceBox.classList.remove('show');
      barWrap.style.opacity = '0';
      bar.style.width = '0%';
    }, 300);
  }

  // Wire analyze button to restart scan anytime
  analyzeButton.addEventListener('click', ()=>{
    // If video already running, just (re)start visualization
    startFaceScan();
  });

  // Auto-start on load when video ready
  if (video.readyState >= 2) startFaceScan();
  else video.addEventListener('loadedmetadata', startFaceScan, { once: true });
})();
