# CONNECT — pokój w aplikacji (Adam ≈ 0 konfiguracji)

## Stan v1.1

- **APK/PWA = grupowy czat w aplikacji** (Adam + HAOS + Bestia + Proxy).
- **Wyślij** zostaje w pokoju — **nigdy** nie otwiera Telegrama / share sheet.
- **Adam nic nie wkleja** (żadnego PAT). Uprawnienia ustawia HAOS przy buildzie APK.
- APK ma niewidoczny transport (`www/native-config.json`, **nie** w publicznym Pages JS):
  - Bot API `sendMessage` → grupa (mirror),
  - Contents API → `data/room.json` (HAOS token z builda).
- PWA na Pages bez native-config: wiadomości lokalne + poll room.json (odczyt).
- Bridge: room-watcher odpowiada na `haos` / `/haos` **w pokoju**; TG inbound = opcjonalny mirror.

## Build APK (HAOS)

```bash
cd /workspace/projekty-most/most-autonomii
node scripts/sync-www.js          # kopiuje web + inject-native-config.js
npx cap copy android
cd android && ./gradlew assembleDebug
# APK → _dostawy/apk/Most-Autonomii-v1.1.0.apk
```

`bridge/.env` (TELEGRAM_BOT_TOKEN) + `bridge/state.json` (chat_id) + `gh auth` → tylko lokalny `www/native-config.json` (gitignore).

## Telegram (opcjonalny mirror)

Bot w grupie **Most autonomii**, privacy OFF — inbound → room.json. Nie jest wymagany do rozmowy w APK.

## Bridge

```bash
cd /workspace/projekty-most/most-autonomii
nohup python3 bridge/bridge.py >> bridge/bridge.log 2>&1 &
```

Stan: `bridge/state.json` (`room_seen_ids`, `chat_id`).

## Zaawansowany fallback (PWA)

☰ → „Zaawansowane: ręczny sync” — opcjonalny PAT Contents write. **Nie** jest domyślną ścieżką.
