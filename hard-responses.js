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
