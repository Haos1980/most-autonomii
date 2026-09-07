# Most Autonomii

Wspólny hub czterech stron na jednym moście:

1. **Adam** (Prezes) — człowiek  
2. **HAOS** — agent Grok Bot  
3. **Grok Proxy** — komendy `proxy` / `grok`  
4. **Bestia** — autonomia telefonu, komendy `bestia`

Polski interfejs, dark UI, mobile-first PWA (portrait). Czat grupowy, chipy komend w stylu Telegrama, tablica zadań i panel mostu do grupy Telegram „Most autonomii”.

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

## Funkcje MVP (v1)

- Czat z 4 awatarami / rolami i statusami obecności (online / away / busy)
- Pisanie jako Adam; kolory autorów wiadomości
- Chipy: `bestia …`, `proxy …`, `grok …`, `haos …` (prefiksy routingu)
- **📋 TG** — kopiuj skomponowaną komendę do schowka (wklej w Telegramie)
- Tablica zadań: todo / doing / done (localStorage + eksport/import JSON)
- Panel **Most**: instrukcje + placeholder deep linka do grupy Telegram
- Sync v1: localStorage (pokój `most-adam`) + BroadcastChannel (wiele kart) + udostępnianie snapshotu; opcjonalny poll `data/room.json` z Pages
- PWA: `manifest.json`, ikony, service worker, instalowalna

> Odpowiedzi agentów w czacie są oznaczone **manual / next wave** — nie udajemy żywego bota w v1.

## Następne fale

| Fala | Co |
|------|----|
| **2** | Bot Telegram w grupie „Most autonomii” → sync wiadomości / obecności do PWA (polling lub webhook) |
| **3** | Głębszy bridge Bestia/Proxy (routing komend z telefonu) |
| **4** | Opcjonalny APK (WebView / TWA) opakowujący tę PWA |

Szczegóły techniczne mostu: [CONNECT.md](./CONNECT.md)

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

## Telegram bridge (v2)

Long-poll bot: `bridge/bridge.py` (requires `TELEGRAM_BOT_TOKEN`).  
See [CONNECT.md](CONNECT.md) — Adam must add **@brat_besti_grok_proxy_bot** to group **Most autonomii** and disable BotFather privacy.

