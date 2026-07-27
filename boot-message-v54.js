/* Smažka v54 — one quiet boot/scan message instead of duplicated branding. */
(() => {
  'use strict';

  const copy = document.querySelector('.boot-message-copy');
  if (!copy) return;

  const messages = [
    'SKENUJI ÚROVEŇ SMAŽKY',
    'PŘIPRAV KSICHT NA VERDIKT',
    'DETEKCE SMAŽKY: STANDBY',
    'ANALÝZA OBLIČEJE // ČEKÁM',
    'SCAN READY — UKAŽ TVÁŘ',
    'NAČÍTÁM STUPEŇ ZKÁZY'
  ];

  function randomIndex(max) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % max;
  }

  let previous = -1;
  function selectMessage() {
    let index = randomIndex(messages.length);
    if (messages.length > 1 && index === previous) index = (index + 1) % messages.length;
    previous = index;
    copy.textContent = messages[index];
  }

  selectMessage();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) selectMessage();
  });
})();
