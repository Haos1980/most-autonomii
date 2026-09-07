# CONNECT — most Telegram ↔ Most Autonomii

## Stan v2 (live bridge)

- PWA trzyma czat lokalnie (localStorage) i **co ~4 s** merge’uje `data/room.json` z GitHub Pages.
- Bridge (`bridge/bridge.py`) long-polluje Telegram Bot API (`getUpdates`), mapuje grupę **Most autonomii**, dopisuje wiadomości do `data/room.json` i pushuje przez `gh api` contents.
- Kierunek powrotny: PWA „Wyślij do TG” / chipy → schowek + kolejka; `data/outbox.json` → bridge `sendMessage` do grupy.
- Status: `data/bridge_status.json` (bot, chat_id, last sync).

Token bota: **tylko** `process.env.TELEGRAM_BOT_TOKEN` (lub `bridge/.env` lokalnie). Nigdy nie commitować tokena.

## Co Adam musi zrobić w Telegramie

1. Dodać bota (**@brat_besti_grok_proxy_bot**) do grupy **Most autonomii** (najlepiej jako admin z odczytem wiadomości).
2. W BotFather: **/setprivacy → Disable**, żeby bot widział wszystkie wiadomości grupy (nie tylko komendy `/`).
3. Napisać coś w grupie — bridge wykryje `chat_id` i zacznie sync do PWA.

**Jedno zdanie dla HAOS → Adam:** Dodaj @brat_besti_grok_proxy_bot do grupy „Most autonomii” (admin) i w BotFather wyłącz privacy (`/setprivacy` → Disable), potem napisz cokolwiek w grupie.

## Uruchomienie bridge (HAOS / box)

```bash
cd /workspace/most-autonomii
# TELEGRAM_BOT_TOKEN must be in env (or bridge/.env)
nohup python3 bridge/bridge.py >> bridge/bridge.log 2>&1 &
```

Logi: `bridge/bridge.log`. Stan: `bridge/state.json` (chat_id, offset).

## Outbox (PWA → Telegram)

Plik `data/outbox.json`:

```json
{
  "pending": [
    { "id": "m_…", "author": "adam", "text": "bestia status", "ts": 0 }
  ],
  "updatedAt": "…"
}
```

Bridge wysyła `pending` do grupy i czyści kolejkę. Z telefonu Adama Pages nie przyjmuje POST — użyj schowka albo poproś HAOS o push outbox przez `gh api`.

## Deep link grupy

1. W Telegramie otwórz grupę **Most autonomii**.
2. Skopiuj link (`https://t.me/+…` lub `https://t.me/c/…`).
3. PWA → ☰ → Deep link Telegram → Zapisz.

## Aktualizacja plików przez gh api

```bash
CONTENT=$(base64 -w0 < data/room.json)
SHA=$(gh api repos/Haos1980/most-autonomii/contents/data/room.json --jq .sha)
gh api --method PUT repos/Haos1980/most-autonomii/contents/data/room.json \
  -f message='chore: sync room' \
  -f content="$CONTENT" \
  -f sha="$SHA"
```

## Fala 3+

- Webhook zamiast long-poll (Cloudflare Worker).
- Zapis outbox z telefonu bez pośrednika (mini-app / edge).

## Konflikt getUpdates (409)

Ten sam bot (`@brat_besti_grok_proxy_bot`) jest już używany przez istniejący router Grok Proxy / Bestia w grupie. Telegram pozwala tylko na **jeden** aktywny `getUpdates`. Jeśli bridge loguje `409 Conflict`, zatrzymaj drugi poller albo zostaw tylko bridge — inaczej most nie zobaczy wiadomości.

