# Most Autonomii

Wspólny hub czterech stron na jednym moście:

1. **Adam** (Prezes) — człowiek  
2. **HAOS** — agent Grok Bot  
3. **Grok Proxy** — komendy `proxy` / `grok`  
4. **Bestia** — autonomia telefonu, komendy `bestia`

Polski interfejs, dark UI, mobile-first PWA/APK (portrait). **Pokój grupowy w aplikacji** (Adam · HAOS · Proxy · Bestia), chipy komend, tablica zadań. Telegram = opcjonalny mirror (zakładka Most).

**Autor:** Adam (GitHub [Haos1980](https://github.com/Haos1980))

## Otwórz na telefonie (GitHub Pages)

1. Wejdź w Chrome na: **https://haos1980.github.io/most-autonomii/**  
2. Menu (⋮) → **Dodaj do ekranu głównego** / Zainstaluj aplikację.  
3. Uruchom ikonę **Most Autonomii** jak zwykłą apkę (standalone, portrait).

### Lokalnie

```bash
cd most-autonomii
python3 -m http.server 8080
```

Telefon w tej samej sieci Wi‑Fi: `http://IP_KOMPUTERA:8080`

## Funkcje (v1.1 — pokój w aplikacji)

- Czat grupowy z 4 awatarami / obecnością (online / away / busy)
- **Wyślij** zostaje w pokoju (nie otwiera Telegrama)
- Chipy: `bestia …`, `proxy …`, `grok …`, `haos …` — tylko wypełniają / wysyłają in-app
- Sync: localStorage + poll `data/room.json`; z telefonu publish przez **GitHub PAT** w ☰ (Contents write)
- Bridge odpowiada na `haos …` **w pokoju** (bez wymogu TG)
- Zakładka **Most**: opcjonalny mirror Telegram (📋 TG / Wyślij do TG)
- Tablica zadań + PWA/APK

Szczegóły: [CONNECT.md](./CONNECT.md)

## Pliki

| Plik | Opis |
|------|------|
| `index.html` | Shell UI |
| `style.css` | Dark mobile UI |
| `app.js` | Czat, zadania, sync |
| `manifest.json` / `sw.js` | PWA |
| `data/room.json` | Snapshot do pollu (HAOS może aktualizować przez `gh api`) |
| `CONNECT.md` | Plan mostu Telegram |

## Licencja

MIT — używaj swobodnie w ekosystemie HAOS / Adam.

## Android APK (Capacitor)

Debug APK: dist/Most-Autonomii-debug.apk (id pl.haos.mostautonomii).
Instrukcja instalacji (nieznane zrodla): ANDROID.md.
Offline: bundlowane lokalne www/. Poll data/room.json wlaczony domyslnie.

## Bridge (v1.1)

`bridge/bridge.py` — room watcher (HAOS in-app) + opcjonalny long-poll Telegram (`TELEGRAM_BOT_TOKEN`).  
PAT w aplikacji: ☰ → GitHub token. Szczegóły: [CONNECT.md](CONNECT.md).

