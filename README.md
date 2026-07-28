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

- `bundle-base.css` – základ aplikace, typografie a společné komponenty.
- `bundle-scanner.css` – kamera, skenovací HUD a mobilní ovládání.
- `bundle-results.css` – výsledkové komponenty a diagnostika.
- `scan-theme.css` – finální VOID vizuální polish.
- `result-mobile-v71.css` – jediná mobilní autorita pro rozměry výsledkové karty.

### Detekce a verdikt

- `app.js` – stav aplikace, kamera, výsledek a základní share fallback.
- `face-scan.js` – MediaPipe Face Mesh, zachycení a měření fotografie.
- `devastation-metrics.js` – normalizované landmarky, bounds, anchors, metriky a 70/30 severity kontrakt.
- `verdict-matcher.js` – metadata-driven výběr verdiktu.
- `junky-verdict-engine.js` – propojení biometrických metrik s knihovnami hlášek.
- `responses.json`, `responses-hard.json`, `responses-pernik.json` – knihovny verdiktů.

### Výřez, deformace a export

- `face-aware-crop.js` – společný výpočet cover cropu, object-position a přepočtu landmarků.
- `face-aware-crop-runtime.js` – připraví face-aware zdroj pro renderer a synchronizuje crop výsledkové fotografie.
- `face-warp-geometry.js` – převod landmarků na oblasti deformace.
- `face-warp.js` – WebGL/canvas deformace a finální PNG.
- `share-cover.js` – sdílená 1080 × 1920 karta používající stejnou crop geometrii.
- `privacy-hardening.js` – lokální scrub citlivých dat; původní a pracovní oříznutá fotka jsou vedené odděleně.

### PWA

- `manifest.json` – instalační metadata.
- `service-worker.js` – verzovaná offline cache a update lifecycle.
- `pwa-update-fix.js` – spolehlivé kliknutí na aktualizaci v iOS PWA.

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

Testy používají vestavěný Node test runner:

```bash
node --test tests/*.test.mjs
```

Důležité kontrakty:

- `tests/devastation-metrics.test.mjs` – metriky a severity.
- `tests/face-warp-geometry.test.mjs` – mapování landmarků do rendereru.
- `tests/face-aware-crop.test.mjs` – crop pro obličej vlevo, vpravo a transformace landmarků.
- `tests/pwa-cache.test.mjs` – shoda HTML, runtime souborů a offline cache.

## Poznámka

Výsledek je meme artefakt. Aplikace nedetekuje užívání látek, zdravotní stav ani identitu člověka.
