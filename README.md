# Jsem smažka?

Srandovní webová appka, která simuluje lokální AI sken obličeje a vygeneruje meme výsledek ve stylu „damage level po večírku“.

## Co appka umí

- Spustí kameru přímo v prohlížeči.
- Umí přepnout přední/zadní kameru a použít vlastní fotku.
- Zobrazí animovaný pseudo scan nad skutečnými lokálně detekovanými body obličeje.
- Vybere hlášku z explicitního rozsahu závažnosti a dominantních vizuálních signálů; náhoda rozhoduje jen mezi stejně vhodnými kandidáty.
- Používá jednotný VOID vizuální svět s výrazným, ale čitelným mobilním HUDem.
- Podle damage levelu lokálně a animovaně deformuje obličej (nafouknutí, stažení, vlnění a stékání).
- Vygeneruje sdílitelný PNG obrázek s deformovaným obličejem a hláškou.
- Funguje jako instalovatelná PWA i offline díky `manifest.json` a `service-worker.js`.
- Fotka se neposílá na server. Všechno běží lokálně v prohlížeči.
- Nepoužívá žádný externí skript ani analytiku.

## Soubory

- `index.html` – základ stránky, metadata a struktura UI.
- `styles.css` – základní komponenty a desktopový fallback.
- `visual-system.css` – základ toxic/iOS vizuálního systému, mobilní kamera, reveal a výsledkový layout.
- `quiet-scan.css` – finální vizuální autorita, hierarchie, kontrast a mobilní layout.
- `face-warp.css` – vizuální efekty deformace, skenu a výsledku.
- `app.js` – kamera, stav aplikace, výsledky, sdílení a PWA registrace.
- `face-scan.js` – MediaPipe mapování očí, nosu, úst a kontury, animace skenu a zachycení snímku.
- `vendor/mediapipe-face-mesh/` – lokální Apache-2.0 MediaPipe Face Mesh model a WebAssembly runtime.
- `devastation-metrics.js` – společný lokální kontrakt landmarků, kotev, metrik a satirického skóre.
- `verdict-matcher.js` – čistý metadata-driven výběr verdiktu bez odvozování z textu nebo pořadí.
- `face-warp.js` – jednotná WebGL/canvas deformace obličeje a příprava sdíleného PNG.
- `responses.json`, `responses-hard.json` a `responses-pernik.json` – knihovny hlášek s explicitními poli `severity`, `effect` a `signals`.
- `manifest.json` – PWA nastavení.
- `service-worker.js` – offline cache.
- `icon.svg` – ikona aplikace.

## Lokální spuštění

Kvůli kameře je nejlepší spustit appku přes HTTPS, případně přes lokální server. Obyčejné otevření `index.html` ze souboru může v některých prohlížečích blokovat kameru nebo načítání JSON souboru.

Jednoduchá varianta pro lokální test:

```bash
python3 -m http.server 8000
```

Potom otevři:

```text
http://localhost:8000
```

## Nasazení

Projekt je statická webová aplikace, takže jde nasadit například na GitHub Pages, Vercel, Netlify nebo Cloudflare Pages. Není potřeba žádný backend.

## Kontrakt verdiktu

Každá hláška nese vlastní rozsah `severity.min/max`, klíč rendereru `effect` a seznam kompatibilních vizuálních `signals`. Přesunutí hlášky v JSONu ani změna jejího českého textu proto nemění závažnost nebo efekt. Pokud metadata chybí, výběrový modul položku nahlásí a renderer použije dokumentovaný neutrální fallback `facial-drift`.

## Poznámka

Výsledek je čistě pro srandu. Není to zdravotní, právní ani žádná jiná diagnóza. Je to prostě meme mašina s dramatickým výrazem.
