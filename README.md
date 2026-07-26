# Jsem smažka?

Srandovní webová appka, která simuluje lokální AI sken obličeje a vygeneruje meme výsledek ve stylu „damage level po večírku“.

## Co appka umí

- Spustí kameru přímo v prohlížeči.
- Umí přepnout přední/zadní kameru a použít vlastní fotku.
- Zobrazí animovaný pseudo scan nad skutečnými lokálně detekovanými body obličeje.
- Náhodně vybere hlášku z `responses.json`.
- Podle damage levelu lokálně a animovaně deformuje obličej (nafouknutí, stažení, vlnění a stékání).
- Vygeneruje sdílitelný PNG obrázek s deformovaným obličejem a hláškou.
- Funguje jako instalovatelná PWA i offline díky `manifest.json` a `service-worker.js`.
- Fotka se neposílá na server. Všechno běží lokálně v prohlížeči.
- Nepoužívá žádný externí skript ani analytiku.

## Soubory

- `index.html` – základ stránky, metadata a struktura UI.
- `styles.css` – základní komponenty a desktopový fallback.
- `visual-system.css` – finální toxic/iOS vizuální systém, mobilní kamera, reveal a výsledkový layout.
- `face-warp.css` – vizuální efekty deformace, skenu a výsledku.
- `app.js` – kamera, stav aplikace, výsledky, sdílení a PWA registrace.
- `face-scan.js` – MediaPipe mapování očí, nosu, úst a kontury, animace skenu a zachycení snímku.
- `vendor/mediapipe-face-mesh/` – lokální Apache-2.0 MediaPipe Face Mesh model a WebAssembly runtime.
- `face-warp.js` – lokální canvas deformace obličeje a příprava sdíleného PNG.
- `responses.json` – knihovna hlášek.
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

## Poznámka

Výsledek je čistě pro srandu. Není to zdravotní, právní ani žádná jiná diagnóza. Je to prostě meme mašina s dramatickým výrazem.
