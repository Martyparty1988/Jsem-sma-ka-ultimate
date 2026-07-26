(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const app = window.SmazkaApp;
  if (!mobileQuery.matches || !app?.elements) return;

  const { elements } = app;
  const buttonGroup = document.querySelector('.button-group');
  const topbar = document.querySelector('.topbar');
  const localStatus = topbar?.querySelector('.local-status');
  const footer = document.querySelector('footer');

  if (!buttonGroup || !topbar) return;

  document.body.classList.add('ios-one-screen-ready');
  elements.analyzeButton?.setAttribute('aria-label', 'Spustit sken');
  elements.analyzeButton?.setAttribute('title', 'Spustit sken');

  if (elements.switchCameraButton && !elements.switchCameraButton.classList.contains('dock-camera-button')) {
    elements.switchCameraButton.classList.add('dock-camera-button');
    buttonGroup.appendChild(elements.switchCameraButton);
  }

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'ios-settings-button';
  settingsButton.setAttribute('aria-label', 'Otevřít nastavení');
  settingsButton.setAttribute('aria-haspopup', 'dialog');
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.innerHTML = '<span aria-hidden="true">⚙︎</span>';

  const topbarTools = document.createElement('div');
  topbarTools.className = 'topbar-tools';
  if (localStatus) topbarTools.appendChild(localStatus);
  topbarTools.appendChild(settingsButton);
  topbar.appendChild(topbarTools);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'ios-settings-backdrop';
  backdrop.setAttribute('aria-label', 'Zavřít nastavení');
  backdrop.tabIndex = -1;

  const sheet = document.createElement('section');
  sheet.className = 'ios-settings-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'iosSettingsTitle');
  sheet.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = 'ios-settings-header';
  header.innerHTML = '<div><strong id="iosSettingsTitle">Nastavení</strong><small>Všechno zůstává jen v tomhle zařízení.</small></div>';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ios-settings-close';
  closeButton.setAttribute('aria-label', 'Zavřít nastavení');
  closeButton.textContent = '×';
  header.appendChild(closeButton);

  const content = document.createElement('div');
  content.className = 'ios-settings-content';

  const localSettings = footer?.querySelector('.local-settings');
  const privacyNote = footer?.querySelector('.privacy-note');
  const installButton = elements.installButton;

  if (localSettings) content.appendChild(localSettings);
  if (privacyNote) content.appendChild(privacyNote);
  if (installButton) content.appendChild(installButton);

  const installHelp = document.createElement('p');
  installHelp.className = 'ios-install-help';
  installHelp.innerHTML = '<strong>Instalace na iPhone:</strong> otevři Sdílet a zvol „Přidat na plochu“.';
  content.appendChild(installHelp);

  sheet.append(header, content);
  document.body.append(backdrop, sheet);

  let previousFocus = null;

  function openSettings() {
    previousFocus = document.activeElement;
    document.body.classList.add('settings-open');
    settingsButton.setAttribute('aria-expanded', 'true');
    sheet.setAttribute('aria-hidden', 'false');
    if (elements.app) elements.app.inert = true;
    window.requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  }

  function closeSettings() {
    if (!document.body.classList.contains('settings-open')) return;
    document.body.classList.remove('settings-open');
    settingsButton.setAttribute('aria-expanded', 'false');
    sheet.setAttribute('aria-hidden', 'true');
    if (elements.app) elements.app.inert = false;
    const focusTarget = previousFocus instanceof HTMLElement ? previousFocus : settingsButton;
    window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  }

  function syncDock() {
    const retakeVisible = elements.retakeButton && !elements.retakeButton.classList.contains('hidden');
    elements.switchCameraButton?.classList.toggle('dock-suppressed', Boolean(retakeVisible));
  }

  settingsButton.addEventListener('click', openSettings);
  closeButton.addEventListener('click', closeSettings);
  backdrop.addEventListener('click', closeSettings);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('settings-open')) {
      event.preventDefault();
      closeSettings();
    }
  });

  const controlsObserver = new MutationObserver(syncDock);
  [elements.retakeButton, elements.switchCameraButton].forEach((button) => {
    if (button) controlsObserver.observe(button, { attributes: true, attributeFilter: ['class'] });
  });

  syncDock();

  window.addEventListener('pagehide', () => {
    controlsObserver.disconnect();
    if (elements.app) elements.app.inert = false;
  }, { once: true });
})();
