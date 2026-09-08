#!/usr/bin/env python3
"""Most Autonomii — Telegram ↔ room.json bridge (long-poll).

Reads TELEGRAM_BOT_TOKEN from process env (or bridge/.env). Never logs the token.
"""
from __future__ import annotations

import base64
import json
import os
import fcntl
import re
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIDGE_DIR = Path(__file__).resolve().parent
ROOM_PATH = ROOT / "data" / "room.json"
OUTBOX_PATH = ROOT / "data" / "outbox.json"
STATE_PATH = BRIDGE_DIR / "state.json"
STATUS_PATH = ROOT / "data" / "bridge_status.json"
REPO = "Haos1980/most-autonomii"
GROUP_NAME_HINTS = ("most autonomii", "most autonomi")
KNOWN_USERNAMES = {
    # telegram username (lower) -> party id
    "brat_besti_grok_proxy_bot": "proxy",
    "brat_bestii_haos_bot": "proxy",
}
ROUTE_RE = re.compile(r"^(bestia|proxy|grok|haos)\b", re.I)
POLL_TIMEOUT = 25
OUTBOX_POLL_S = 2
GH_PUSH_MIN_INTERVAL = 2.0


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {msg}"
    print(line, flush=True)


def load_dotenv() -> None:
    """Load bridge/.env; file wins over ambient env so dedicated bot token is used."""
    env_file = BRIDGE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            os.environ[k] = v


def token() -> str:
    t = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    if not t:
        raise SystemExit("TELEGRAM_BOT_TOKEN not set in env")
    return t


def api(method: str, params: dict | None = None, timeout: int = 60) -> dict:
    tok = token()
    url = f"https://api.telegram.org/bot{tok}/{method}"
    data = None
    headers = {}
    if params is not None:
        data = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None}).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Telegram {method} HTTP {e.code}: {body}") from e


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "offset": 0,
        "chat_id": None,
        "chat_title": None,
        "seen_update_ids": [],
        "bot_username": None,
        "bot_id": None,
        "last_sync_at": None,
        "last_error": None,
    }


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_room() -> dict:
    if ROOM_PATH.exists():
        try:
            return json.loads(ROOM_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "roomId": "most-adam",
        "updatedAt": now_iso(),
        "note": "Synced by Telegram bridge",
        "presence": {"adam": "online", "haos": "away", "proxy": "away", "bestia": "away"},
        "messages": [],
        "tasks": [],
        "bridge": {"lastSyncAt": None, "source": "telegram"},
    }


def save_room(room: dict) -> None:
    room["updatedAt"] = now_iso()
    room.setdefault("bridge", {})
    room["bridge"]["lastSyncAt"] = now_iso()
    room["bridge"]["source"] = "telegram"
    ROOM_PATH.parent.mkdir(parents=True, exist_ok=True)
    ROOM_PATH.write_text(json.dumps(room, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_status(state: dict, extra: dict | None = None) -> None:
    payload = {
        "ok": True,
        "botUsername": state.get("bot_username"),
        "botId": state.get("bot_id"),
        "chatId": state.get("chat_id"),
        "chatTitle": state.get("chat_title"),
        "lastSyncAt": state.get("last_sync_at"),
        "lastError": state.get("last_error"),
        "updatedAt": now_iso(),
    }
    if extra:
        payload.update(extra)
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def uid(prefix: str = "tg") -> str:
    return f"{prefix}_{int(time.time() * 1000)}_{os.getpid()}"


_last_gh_push = 0.0


def gh_put_file(path: Path, message: str) -> bool:
    """Push file to GitHub via contents API (no git config)."""
    global _last_gh_push
    wait = GH_PUSH_MIN_INTERVAL - (time.time() - _last_gh_push)
    if wait > 0:
        time.sleep(wait)
    rel = path.relative_to(ROOT).as_posix()
    content_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    sha = None
    try:
        proc = subprocess.run(
            ["gh", "api", f"repos/{REPO}/contents/{rel}", "--jq", ".sha"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode == 0:
            sha = (proc.stdout or "").strip() or None
    except Exception as e:
        log(f"gh get sha warn: {e}")

    args = [
        "gh",
        "api",
        "--method",
        "PUT",
        f"repos/{REPO}/contents/{rel}",
        "-f",
        f"message={message}",
        "-f",
        f"content={content_b64}",
    ]
    if sha:
        args.extend(["-f", f"sha={sha}"])
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=90)
        _last_gh_push = time.time()
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "")[:400]
            # redact any accidental token-looking substrings
            err = re.sub(r"\d{6,}:[A-Za-z0-9_-]{20,}", "<redacted>", err)
            log(f"gh put {rel} failed: {err}")
            return False
        log(f"gh put {rel} ok")
        return True
    except Exception as e:
        log(f"gh put {rel} exception: {e}")
        return False


def is_target_chat(chat: dict, state: dict) -> bool:
    if not chat:
        return False
    cid = chat.get("id")
    if state.get("chat_id") is not None and cid == state["chat_id"]:
        return True
    title = (chat.get("title") or "").strip().lower()
    ctype = chat.get("type")
    if ctype in ("group", "supergroup") and any(h in title for h in GROUP_NAME_HINTS):
        return True
    # Once discovered, stick to that chat_id
    if state.get("chat_id") is None and ctype in ("group", "supergroup") and title:
        # Accept first matching group name; also accept exact-ish "Most autonomii"
        if any(h in title for h in GROUP_NAME_HINTS):
            return True
    return False


def map_author(msg: dict) -> tuple[str, str | None]:
    """Return (author_id, tag)."""
    text = (msg.get("text") or msg.get("caption") or "").strip()
    frm = msg.get("from") or {}
    username = (frm.get("username") or "").lower()
    is_bot = bool(frm.get("is_bot"))

    # Known bots / usernames
    if username in KNOWN_USERNAMES:
        return KNOWN_USERNAMES[username], "telegram"

    # Route prefix in text
    m = ROUTE_RE.match(text)
    if m:
        key = m.group(1).lower()
        mapped = {"bestia": "bestia", "proxy": "proxy", "grok": "proxy", "haos": "haos"}[key]
        # If human typed routed command, still attribute to adam (command to agent)
        # but if a bot replied starting with name, attribute to that party
        if is_bot:
            return mapped, "telegram"
        # Human sending "bestia …" → adam authored the command
        return "adam", "telegram→routed"

    if is_bot:
        # Unknown bot → haos as orchestration default
        return "haos", "telegram-bot"

    return "adam", "telegram"


def presence_bump(room: dict, author: str) -> None:
    room.setdefault("presence", {})
    if author in ("adam", "haos", "proxy", "bestia"):
        room["presence"][author] = "online"


def append_message(room: dict, msg: dict, author: str, tag: str | None) -> bool:
    text = (msg.get("text") or msg.get("caption") or "").strip()
    if not text:
        return False
    tg_id = msg.get("message_id")
    mid = f"tg_{msg.get('chat', {}).get('id')}_{tg_id}"
    existing = {m.get("id") for m in room.get("messages") or []}
    if mid in existing:
        return False
    ts = (msg.get("date") or int(time.time())) * 1000
    entry = {
        "id": mid,
        "author": author,
        "text": text,
        "ts": ts,
        "at": now_iso(),
        "source": "telegram",
    }
    if tag:
        entry["tag"] = tag
    if not entry.get("at"):
        entry["at"] = now_iso()
    room.setdefault("messages", []).append(entry)
    # keep last 500
    if len(room["messages"]) > 500:
        room["messages"] = room["messages"][-500:]
    presence_bump(room, author)
    return True



HAOS_MENTION_RE = re.compile(
    r"^(?:haos\b|/haos(?:@[A-Za-z0-9_]+)?\b|@Brat_Bestii_Haos_bot\b)",
    re.I,
)


def maybe_reply_haos(msg: dict, state: dict) -> None:
    """If inbound text starts with haos / /haos / @Brat_Bestii_Haos_bot, send a short Telegram ack."""
    if not state.get("chat_id"):
        return
    text = (msg.get("text") or msg.get("caption") or "").strip()
    if not text:
        return
    m = HAOS_MENTION_RE.match(text)
    if not m:
        return
    rest = text[m.end():].lstrip(" :,-—").strip()
    ack = f"HAOS: ok — {rest}" if rest else "HAOS: ok — słyszę."
    # keep acks short
    if len(ack) > 400:
        ack = ack[:397] + "..."
    try:
        params = {
            "chat_id": str(state["chat_id"]),
            "text": ack,
            "disable_web_page_preview": "true",
        }
        if msg.get("message_id") is not None:
            params["reply_to_message_id"] = str(msg["message_id"])
        resp = api("sendMessage", params, timeout=30)
        if resp.get("ok"):
            log(f"haos ack sent for msg_id={msg.get('message_id')}")
        else:
            log(f"haos ack not ok: {str(resp)[:200]}")
    except Exception as e:
        log(f"haos ack err: {e}")


def process_update(upd: dict, state: dict, room: dict) -> bool:
    changed = False
    msg = upd.get("message") or upd.get("edited_message") or upd.get("channel_post")
    if not msg:
        return False
    chat = msg.get("chat") or {}
    title = chat.get("title") or ""
    # Discover / lock chat
    if is_target_chat(chat, state) or (
        state.get("chat_id") is None
        and chat.get("type") in ("group", "supergroup")
        and any(h in title.lower() for h in GROUP_NAME_HINTS)
    ):
        if state.get("chat_id") != chat.get("id"):
            state["chat_id"] = chat.get("id")
            state["chat_title"] = title
            log(f"bound chat_id={state['chat_id']} title={title!r}")
            changed = True
    elif state.get("chat_id") is not None and chat.get("id") != state["chat_id"]:
        return False
    elif state.get("chat_id") is None:
        # Not yet bound and not matching name — ignore
        if chat.get("type") in ("group", "supergroup"):
            log(f"skip group title={title!r} id={chat.get('id')} (waiting for Most autonomii)")
        return False

    author, tag = map_author(msg)
    if append_message(room, msg, author, tag):
        log(f"msg from={author} tag={tag} id={msg.get('message_id')}")
        changed = True
    # Reply on haos / @Brat_Bestii_Haos_bot triggers (inbound to bound chat)
    maybe_reply_haos(msg, state)
    return changed


def process_outbox(state: dict) -> bool:
    if not state.get("chat_id"):
        return False
    if not OUTBOX_PATH.exists():
        return False
    try:
        data = json.loads(OUTBOX_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        log(f"outbox read err: {e}")
        return False
    items = data if isinstance(data, list) else data.get("messages") or data.get("pending") or []
    if not items:
        return False
    remaining = []
    sent_any = False
    for item in items:
        if item.get("sent") or item.get("status") == "sent":
            continue
        text = (item.get("text") or "").strip()
        if not text:
            continue
        try:
            resp = api(
                "sendMessage",
                {
                    "chat_id": str(state["chat_id"]),
                    "text": text,
                    "disable_web_page_preview": "true",
                },
                timeout=30,
            )
            if resp.get("ok"):
                log(f"outbox sent id={item.get('id')}")
                sent_any = True
                # Also mirror into room as adam (if not already)
                room = load_room()
                mid = item.get("id") or uid("pwa")
                ids = {m.get("id") for m in room.get("messages") or []}
                if mid not in ids:
                    at_iso = item.get("at") or now_iso()
                    room.setdefault("messages", []).append(
                        {
                            "id": mid,
                            "author": item.get("author") or "adam",
                            "text": text,
                            "ts": item.get("ts") or int(time.time() * 1000),
                            "at": at_iso,
                            "tag": "pwa→telegram",
                            "source": "outbox",
                        }
                    )
                    presence_bump(room, item.get("author") or "adam")
                    save_room(room)
                    gh_put_file(ROOM_PATH, "bridge: room sync after outbox send")
                    gh_put_file(STATUS_PATH, "bridge: status after outbox")
            else:
                log(f"outbox send not ok: {str(resp)[:200]}")
                remaining.append(item)
        except Exception as e:
            log(f"outbox send err: {e}")
            remaining.append(item)
    # rewrite outbox with only failures / empty
    OUTBOX_PATH.write_text(
        json.dumps({"pending": remaining, "updatedAt": now_iso()}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if sent_any:
        try:
            gh_put_file(OUTBOX_PATH, "bridge: clear outbox")
        except Exception:
            pass
    return sent_any


LOCK_PATH = BRIDGE_DIR / "bridge.lock"
COMMANDS_PATH = BRIDGE_DIR / "commands.jsonl"


def acquire_singleton():
    """Ensure only one getUpdates poller runs on this box."""
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = open(LOCK_PATH, "a+")
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another bridge already holds bridge.lock — exit")
        raise SystemExit(0)
    fh.seek(0)
    fh.truncate()
    fh.write(str(os.getpid()) + "\n")
    fh.flush()
    return fh


def append_command(route: str, text: str, meta: dict) -> None:
    rec = {"ts": now_iso(), "route": route, "text": text, **meta}
    with open(COMMANDS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")



def main() -> None:
    load_dotenv()
    _ = token()  # fail fast
    lock_fh = acquire_singleton()
    state = load_state()
    log("bridge starting (sole poller)…")
    me = api("getMe", timeout=30)
    if not me.get("ok"):
        log("getMe failed")
        raise SystemExit(1)
    res = me["result"]
    state["bot_username"] = res.get("username")
    state["bot_id"] = res.get("id")
    # Register known bot username → proxy by default for this bot
    if state["bot_username"]:
        KNOWN_USERNAMES[state["bot_username"].lower()] = "proxy"
    save_state(state)
    write_status(state, {"running": True})
    log(f"getMe ok username={state['bot_username']} id={state['bot_id']}")
    if state.get("chat_id"):
        log(f"resuming chat_id={state['chat_id']} title={state.get('chat_title')!r}")
    else:
        log('waiting to discover group "Most autonomii" from updates')

    # Ensure outbox exists
    if not OUTBOX_PATH.exists():
        OUTBOX_PATH.write_text(
            json.dumps({"pending": [], "updatedAt": now_iso()}, indent=2) + "\n", encoding="utf-8"
        )

    last_outbox = 0.0
    while True:
        try:
            offset = int(state.get("offset") or 0)
            resp = api(
                "getUpdates",
                {"offset": offset, "timeout": POLL_TIMEOUT, "allowed_updates": json.dumps(["message", "edited_message"])},
                timeout=POLL_TIMEOUT + 40,
            )
            room = load_room()
            room_changed = False
            if resp.get("ok"):
                # Successful poll clears prior 409/transient errors
                state["last_error"] = None
                for upd in resp.get("result") or []:
                    uid_ = upd.get("update_id")
                    if uid_ is not None:
                        state["offset"] = max(int(state.get("offset") or 0), int(uid_) + 1)
                    if process_update(upd, state, room):
                        room_changed = True
                if room_changed:
                    state["last_sync_at"] = now_iso()
                    save_room(room)
                    save_state(state)
                    write_status(state, {"running": True, "ok": True})
                    gh_put_file(ROOM_PATH, "bridge: sync Telegram → room.json")
                    gh_put_file(STATUS_PATH, "bridge: status sync")
                else:
                    save_state(state)
                    write_status(state, {"running": True, "ok": True})
            # outbox poll
            if time.time() - last_outbox >= OUTBOX_POLL_S:
                last_outbox = time.time()
                process_outbox(state)
                write_status(state, {"running": True})
        except TimeoutError:
            # Long-poll idle end can race urllib timeout; soft retry, no traceback spam
            log("getUpdates soft timeout — retry")
            state["last_error"] = None
            write_status(state, {"running": True, "ok": True})
            continue
        except Exception as e:
            err = str(e)
            state["last_error"] = err[:300]
            save_state(state)
            write_status(state, {"running": True, "ok": False})
            # 409 = another getUpdates client; back off longer without dumping full traceback every time
            if "409" in err or "Conflict" in err:
                log(f"getUpdates conflict (409) — waiting 35s for other poller to release")
                time.sleep(35)
            else:
                log(f"loop error: {e}")
                traceback.print_exc()
                time.sleep(5)


if __name__ == "__main__":
    main()
