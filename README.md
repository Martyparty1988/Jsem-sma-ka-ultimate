# Jsem smažka?

Srandovní webová appka, která simuluje lokální AI sken obličeje a vygeneruje meme výsledek ve stylu „damage level po večírku“.

## Co appka umí

- Spustí kameru přímo v prohlížeči.
- Zobrazí animovaný pseudo scan obličeje.
- Náhodně vybere hlášku z `responses.json`.
- Vygeneruje sdílitelný PNG obrázek s výsledkem.
- Funguje jako jednoduchá PWA díky `manifest.json` a `service-worker.js`.
- Fotka se neposílá na server. Všechno běží lokálně v prohlížeči.

## Soubory

- `index.html` – základ stránky, metadata a struktura UI.
- `styles.css` – responzivní dark/neon design.
- `app.js` – kamera, stav aplikace, výsledky, sdílení a PWA registrace.
- `face-scan.js` – animace skenu a zachycení aktuálního snímku.
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
