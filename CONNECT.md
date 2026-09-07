# CONNECT — most Telegram ↔ Most Autonomii

## Stan v1 (teraz)

- PWA trzyma czat i zadania w **localStorage** (klucz pokoju, domyślnie `most-adam`).
- **BroadcastChannel** synchronizuje karty w tej samej przeglądarce.
- **Udostępnij snapshot** (przycisk ⇄) kopiuje JSON na inne urządzenie.
- Opcjonalnie: włącz w ustawieniach poll **`data/room.json`** z GitHub Pages (tylko odczyt).
- GitHub Pages **nie przyjmuje POST** z telefonu Adama — zapis z klienta do repo nie jest możliwy bez backendu / gh tokena.

Odpowiedzi HAOS / Proxy / Bestia w UI mają tag **`manual / next wave`**.

## Deep link grupy

1. W Telegramie otwórz grupę **Most autonomii**.
2. Skopiuj link zaproszenia / deep link (`https://t.me/+…` lub `https://t.me/c/…`).
3. W PWA: menu ☰ → pole **Deep link Telegram** → Zapisz.
4. Zakładka **Most** → przycisk otworzy Telegram.

## Fala 2 — bot Telegram

Proponowany przepływ (bez płatnego backendu Cursor Origin):

1. Bot (np. python-telegram-bot / grammY) w grupie „Most autonomii”.
2. Komendy `bestia …`, `proxy …`, `grok …`, `haos …` routowane do właściwego agenta / kolejki.
3. Sync do PWA — jedna z opcji:
   - Bot aktualizuje **gist** lub plik `data/room.json` w repo przez GitHub API (HAOS / CI).
   - PWA polluje co N sekund (już przygotowane UI).
   - Później: Telegram WebApp / mini-app z `initData`.
4. Odpowiedzi agentów pojawiają się w czacie PWA z prawdziwym autorem (bez tagu „manual”), gdy bot je dopisze do `room.json` / gista.

### Aktualizacja `data/room.json` przez HAOS (przykład)

```bash
# lokalnie / agent
CONTENT=$(base64 -w0 < data/room.json)   # na macOS: base64 -i …
SHA=$(gh api repos/Haos1980/most-autonomii/contents/data/room.json --jq .sha)
gh api --method PUT repos/Haos1980/most-autonomii/contents/data/room.json \
  -f message='chore: sync room snapshot' \
  -f content="$CONTENT" \
  -f sha="$SHA"
```

## Fala 3+

- Webhook zamiast pollu (Cloudflare Worker / darmowy edge — do decyzji).
- Presence live z Bestii (telefon).
- APK / TWA opakowujące `https://haos1980.github.io/most-autonomii/`.

## Czego nie robić w v1

- Nie wymagać płatnego Firebase / Ably / PartyKit (opcjonalnie później, jeśli pojawią się klucze w env).
- Nie udawać żywych odpowiedzi Bestii / Proxy bez mostu.
- Nie prosić o dane bankowe ani sekrety w czacie PWA.
