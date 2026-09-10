# CONNECT — pokój w aplikacji + opcjonalny mirror Telegram

## Stan v1.1 (in-app room)

- **APK/PWA = grupowy czat w aplikacji** (Adam + HAOS + Bestia + Proxy). Wszyscy widzą te same wiadomości.
- Wysyłanie (**Wyślij**) zostaje w pokoju — **nie** otwiera Telegrama ani share sheet.
- Wspólny stan: `data/room.json` na GitHub Pages. PWA **co ~4 s** merge’uje nowe wiadomości.
- Z telefonu: ustaw w **☰ Ustawienia** fine-grained **GitHub PAT** (Contents: Read and write na `Haos1980/most-autonomii`) — wtedy Wyślij publikuje do `data/room.json` przez Contents API. Token tylko w localStorage.
- Bez tokenu: wiadomość lokalna + toast „Lokalnie — ustaw GitHub token…”.
- Bridge (`bridge/bridge.py`) **obserwuje room.json** i na nowe wiadomości Adama z wzmianką `haos` / `/haos` / `@…` dopisuje odpowiedź HAOS **w pokoju** (bez wymogu Telegrama).
- Telegram = **opcjonalny mirror** (zakładka Most → „Wyślij do TG” / deep link). Bridge nadal może long-pollować grupę **Most autonomii** → room.json.

Token bota: **tylko** `process.env.TELEGRAM_BOT_TOKEN` (lub `bridge/.env` lokalnie). Nigdy nie commitować tokena ani PAT Adama.

## GitHub PAT na telefonie (Adam)

1. GitHub → Settings → Developer settings → Fine-grained personal access tokens.
2. Repo: `Haos1980/most-autonomii`, permission **Contents: Read and write**.
3. W aplikacji Most Autonomii → ☰ → pole **GitHub token** → Zapisz.
4. Wyślij wiadomość — toast „Wysłano do pokoju (sync GitHub)”.

## Co Adam może zrobić w Telegramie (opcjonalnie)

1. Dodać bota (**@Brat_Bestii_Haos_bot**) do grupy **Most autonomii** (admin + odczyt).
2. BotFather: **/setprivacy → Disable**.
3. Wiadomości z grupy trafią do pokoju przez bridge; odpowiedzi HAOS z TG też są mirrorowane do room.json.

## Uruchomienie bridge (HAOS / box)

```bash
cd /workspace/projekty-most/most-autonomii
# TELEGRAM_BOT_TOKEN w env lub bridge/.env (opcjonalnie dla mirror TG)
nohup python3 bridge/bridge.py >> bridge/bridge.log 2>&1 &
```

Logi: `bridge/bridge.log`. Stan: `bridge/state.json` (`chat_id`, `offset`, `room_seen_ids`).

## Outbox (opcjonalnie: pokój → Telegram)

Plik `data/outbox.json` — bridge wysyła `pending` do grupy. Z zakładki Most: „Wyślij do TG”.

## Aktualizacja plików przez gh api

```bash
CONTENT=$(base64 -w0 < data/room.json)
SHA=$(gh api repos/Haos1980/most-autonomii/contents/data/room.json --jq .sha)
gh api --method PUT repos/Haos1980/most-autonomii/contents/data/room.json \
  -f message='chore: sync room' \
  -f content="$CONTENT" \
  -f sha="$SHA"
```

## Konflikt getUpdates (409)

Jeden aktywny `getUpdates` na bota. Bridge: singleton lock `bridge.lock`.
