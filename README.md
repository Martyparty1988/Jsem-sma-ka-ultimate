# Jsem smažka?

Satirická mobilní webová aplikace, která lokálně změří MediaPipe Face Mesh landmarky, vybere absurdní meme verdikt a deformuje původní obličej. Výsledek je záměrně přehnaný a není diagnóza.

## Co aplikace umí

- Otevře kameru přímo v prohlížeči nebo přijme nahranou fotku.
- Sleduje 468–478 skutečných bodů očí, nosu, úst a kontury obličeje.
- Počítá lokální satirické metriky a podle explicitních metadat vybírá kompatibilní verdikt.
- Deformuje obličej pomocí WebGL s canvas fallbackem.
- Používá face-aware výřez, takže obličej zůstává ve výsledku i sdílené kartě ve stejné pozici.
- Generuje sdílitelný VOID verdict cover 1080 × 1920.
- Funguje jako instalovatelná PWA a po načtení také offline.
- Fotku ani biometrická data nikam neposílá.

## Produkční vrstvy

### UI

- `foundation.css` – tokeny, reset, typografie, přístupnost a společné prvky.
- `components.css` – kamera, skenovací HUD, ovládání a sdílené komponenty.
- `screens.css` – obecné obrazovky a starší sdílené výsledkové komponenty.
- `result-poster.css` – jediná mobilní kompozice výsledku, safe-area a detailní režim.

### Detekce a verdikt

- `app.js` – stav aplikace, uživatelské spuštění kamery a sdílený DOM observer.
- `scanner-runtime.js` – lazy Face Mesh loader, landmarky, HUD a skenovací watchdog.
- `result-runtime.js` – deformace, metadata-driven verdikt a diagnostika.
- `lifecycle-runtime.js` – recovery, reveal, share cover a PWA update lifecycle; nevlastní geometrii posteru.
- `result-poster-runtime.js` – identita posteru a stav detailního rozboru; nepřesouvá výsledkové uzly.
- `devastation-metrics.js` – normalizované landmarky, bounds, anchors, metriky a 70/30 severity kontrakt.
- `verdict-matcher.js` – metadata-driven výběr verdiktu.
- `responses.json`, `responses-hard.json`, `responses-pernik.json` – knihovny verdiktů.

### Výřez, deformace a export

- `face-warp-geometry.js` – převod landmarků na oblasti deformace.
- `result-runtime.js` obsahuje WebGL/canvas renderer a verdikt.
- `lifecycle-runtime.js` obsahuje společný face-aware crop, lokální scrub citlivých dat a sdílenou kartu 1080 × 1920.

### PWA

- `manifest.json` – instalační metadata.
- `service-worker.js` – malý verzovaný app shell a oddělená stabilní runtime cache.
- MediaPipe/WASM se nestahuje při instalaci. Načte se až po klepnutí uživatele a cache uchová jen variantu, kterou prohlížeč skutečně vyžádal.
- První offline spuštění bez dříve načteného modelu zobrazí srozumitelnou výzvu k jednorázovému připojení.

## Lokální spuštění

Kamera vyžaduje HTTPS nebo localhost. Pro rychlý lokální server:

```bash
python3 -m http.server 8000
```

Potom otevři:

```text
http://localhost:8000
```

## Testy

Statické a datové kontrakty používají vestavěný Node test runner:

```bash
npm test
```

Mobilní výsledek se navíc ověřuje ve WebKitu na 393×852 a 393×700:

```bash
npm run test:e2e
```

Důležité kontrakty:

- `tests/devastation-metrics.test.mjs` – metriky a severity.
- `tests/face-warp-geometry.test.mjs` – mapování landmarků do rendereru.
- `tests/face-aware-crop.test.mjs` – crop pro obličej vlevo, vpravo a transformace landmarků.
- `tests/pwa-cache.test.mjs` – shoda HTML, runtime souborů a offline cache.

## Poznámka

Výsledek je meme artefakt. Aplikace nedetekuje užívání látek, zdravotní stav ani identitu člověka.
