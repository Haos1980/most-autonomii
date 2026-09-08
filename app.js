/* Most Autonomii — v2 client (localStorage + BroadcastChannel + live room.json / Telegram bridge) */
(() => {
  'use strict';

  const PARTIES = {
    adam:   { id: 'adam',   name: 'Adam',       short: 'A',  color: 'adam' },
    haos:   { id: 'haos',   name: 'HAOS',       short: 'H',  color: 'haos' },
    proxy:  { id: 'proxy',  name: 'Grok Proxy', short: 'P',  color: 'proxy' },
    bestia: { id: 'bestia', name: 'Bestia',     short: 'B',  color: 'bestia' },
  };

  const DEFAULTS = {
    roomId: 'most-adam',
    tgLink: 'https://t.me/', // ustaw deep link grupy „Most autonomii”
    pollRoom: true,
    presence: {
      adam: 'online',
      haos: 'away',
      proxy: 'away',
      bestia: 'away',
    },
  };

  const LIVE_BASE = 'https://haos1980.github.io/most-autonomii';
  const storeKey = (room) => `most-autonomii:${room}`;
  const cfgKey = 'most-autonomii:cfg';

  /** @type {{roomId:string,tgLink:string,pollRoom:boolean,presence:Record<string,string>}} */
  let cfg = loadCfg();
  /** @type {{messages:any[], tasks:any[], updatedAt:string}} */
  let state = loadState(cfg.roomId);

  let bc = null;
  try {
    bc = new BroadcastChannel('most-autonomii');
    bc.onmessage = (ev) => {
      if (!ev.data || ev.data.roomId !== cfg.roomId) return;
      if (ev.data.type === 'state') {
        state = ev.data.state;
        persist(false);
        renderAll();
      }
    };
  } catch (_) { /* older browsers */ }

  let pollTimer = null;
  let deferredPrompt = null;

  // --- DOM ---
  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');
  const inputEl = $('input');
  const toastEl = $('toast');

  // --- boot ---
  document.addEventListener('DOMContentLoaded', () => {
    seedWelcome();
    renderAll();
    bindUI();
    registerSW();
    setupInstall();
    restartPoll();
    window.addEventListener('storage', onStorage);
  });

  function loadCfg() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(cfgKey) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveCfg() {
    localStorage.setItem(cfgKey, JSON.stringify(cfg));
  }

  function loadState(roomId) {
    try {
      const raw = localStorage.getItem(storeKey(roomId));
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { messages: [], tasks: [], updatedAt: new Date().toISOString() };
  }

  function persist(broadcast = true) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(storeKey(cfg.roomId), JSON.stringify(state));
    if (broadcast && bc) {
      try { bc.postMessage({ type: 'state', roomId: cfg.roomId, state }); } catch (_) {}
    }
  }

  function onStorage(e) {
    if (e.key === storeKey(cfg.roomId) && e.newValue) {
      try {
        state = JSON.parse(e.newValue);
        renderAll();
      } catch (_) {}
    }
  }

  function seedWelcome() {
    if (state.messages.length) return;
    const now = Date.now();
    state.messages = [
      {
        id: uid(),
        author: 'system',
        text: 'Witaj na Moście Autonomii. Cztery strony w jednym pokoju: Adam · HAOS · Grok Proxy · Bestia.',
        ts: now - 60000,
      },
      {
        id: uid(),
        author: 'haos',
        text: 'HAOS online (PWA v2). Most Telegram live: wiadomości z grupy trafiają tu przez bridge → room.json.',
        ts: now - 50000,
        tag: 'bridge',
      },
      {
        id: uid(),
        author: 'system',
        text: 'Wskazówka: tapnij chip „bestia …”, dopisz komendę, potem „📋 TG” żeby skopiować do Telegrama.',
        ts: now - 40000,
      },
    ];
    if (!state.tasks.length) {
      state.tasks = [
        { id: uid(), title: 'Podłącz deep link grupy Telegram „Most autonomii”', status: 'todo', assignee: 'adam', ts: now },
        { id: uid(), title: 'Most Telegram live (bridge) — dodać bota do grupy', status: 'doing', assignee: 'adam', ts: now },
        { id: uid(), title: 'Przetestuj chipy bestia/proxy/grok/haos na telefonie', status: 'doing', assignee: 'adam', ts: now },
      ];
    }
    persist(false);
  }

  function uid() {
    return 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.hidden = true; }, ms);
  }

  // --- render ---
  function renderAll() {
    $('roomLabel').textContent = cfg.roomId;
    renderPresence();
    renderMessages();
    renderTasks();
    $('tgDeepLink').href = cfg.tgLink || 'https://t.me/';
    $('cfgRoomId').value = cfg.roomId;
    $('cfgTgLink').value = cfg.tgLink || '';
    $('cfgPollRoom').checked = !!cfg.pollRoom;
    $('cfgPresence').value = cfg.presence.adam || 'online';
    updateBridgeStatusUI();
    scheduleOutboxHint();
  }

  function renderPresence() {
    const el = $('presence');
    el.innerHTML = Object.values(PARTIES).map((p) => {
      const st = cfg.presence[p.id] || 'away';
      const label = st === 'online' ? 'online' : st === 'busy' ? 'busy' : 'away';
      return `<div class="pill" data-role="${p.id}">
        <div class="avatar">${p.short}</div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="status"><span class="dot ${label}"></span>${label}</div>
      </div>`;
    }).join('');
  }

  function renderMessages() {
    if (!state.messages.length) {
      messagesEl.innerHTML = '<div class="empty">Brak wiadomości — napisz pierwszą jako Adam.</div>';
      return;
    }
    messagesEl.innerHTML = state.messages.map((m) => {
      if (m.author === 'system') {
        return `<div class="msg system" data-author="system"><div class="body">${escapeHtml(m.text)}</div></div>`;
      }
      const party = PARTIES[m.author] || { name: m.author };
      const me = m.author === 'adam' ? ' me' : '';
      const tag = m.tag ? `<span class="tag">${escapeHtml(m.tag)}</span>` : '';
      return `<div class="msg${me}" data-author="${escapeAttr(m.author)}">
        <div class="meta"><span class="author">${escapeHtml(party.name)}</span><span class="time">${fmtTime(m.ts)}</span></div>
        <div class="body">${escapeHtml(m.text)}</div>${tag}
      </div>`;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderTasks() {
    for (const col of ['todo', 'doing', 'done']) {
      const list = $('col-' + col);
      const items = state.tasks.filter((t) => t.status === col);
      if (!items.length) {
        list.innerHTML = '<li class="empty" style="padding:8px">—</li>';
        continue;
      }
      list.innerHTML = items.map((t) => {
        const who = PARTIES[t.assignee]?.name || t.assignee;
        const moves = [];
        if (col !== 'todo') moves.push(`<button type="button" data-move="todo" data-id="${t.id}">← todo</button>`);
        if (col !== 'doing') moves.push(`<button type="button" data-move="doing" data-id="${t.id}">↻ doing</button>`);
        if (col !== 'done') moves.push(`<button type="button" data-move="done" data-id="${t.id}">✓ done</button>`);
        return `<li class="task" data-assignee="${escapeAttr(t.assignee)}" data-id="${t.id}">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="row">
            <span class="who">${escapeHtml(who)}</span>
            <span class="moves">${moves.join('')}</span>
            <button type="button" class="del" data-del="${t.id}" title="Usuń">✕</button>
          </div>
        </li>`;
      }).join('');
    }
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  // --- actions ---
  function sendMessage(text, author = 'adam', extra = {}) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const id = uid();
    const ts = Date.now();
    state.messages.push({
      id,
      author,
      text: trimmed,
      ts,
      ...extra,
    });
    // Chip / routed commands → outbox for Telegram bridge (no fake "manual / next wave")
    const m = trimmed.match(/^(bestia|proxy|grok|haos)\b/i);
    if (author === 'adam' && m) {
      enqueueOutbox({ id, author, text: trimmed, ts, route: m[1].toLowerCase() });
      if (!hasTgDeepLink()) {
        toast('ustaw deep link grupy');
      } else if (openTelegramWithText(trimmed)) {
        toast('Otwieram Telegram + kolejka mostu');
      } else {
        toast('W kolejce do Telegrama (most)');
      }
    }
    persist(true);
    renderMessages();
  }

  function enqueueOutbox(item) {
    try {
      const key = 'most-autonomii:outbox';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      list.push({ ...item, queuedAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(list));
      // Best-effort: also expose downloadable / syncable payload in snapshot path
      window.__pendingOutbox = list;
      // Attempt to POST is impossible on Pages; bridge reads data/outbox.json from GH.
      // Store intent; btnSendTg / auto sync helper merges into export.
      scheduleOutboxHint();
    } catch (_) {}
  }

  function scheduleOutboxHint() {
    const el = $('outboxHint');
    if (!el) return;
    const n = (window.__pendingOutbox || []).length;
    el.textContent = n
      ? `${n} wiad. w lokalnej kolejce → użyj „Wyślij do TG” / sync mostu (bridge zbierze outbox z repo).`
      : '';
  }

  async function flushOutboxToClipboardOrBridge() {
    const key = 'most-autonomii:outbox';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { list = []; }
    const text = inputEl.value.trim() || (list.length ? list[list.length - 1].text : lastAdamCommand());
    if (!text) { toast('Brak tekstu do wysłania'); return; }
    // Always copy for manual paste fallback
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      inputEl.select();
      document.execCommand('copy');
    }
    // Append to local outbox representation for snapshot / HAOS push
    if (!list.some((x) => x.text === text && Date.now() - (x.ts || 0) < 5000)) {
      const item = { id: uid(), author: 'adam', text, ts: Date.now() };
      list.push(item);
      localStorage.setItem(key, JSON.stringify(list));
      window.__pendingOutbox = list;
    }
    // Build outbox.json payload Adam/HAOS can push — also keep in snapshot
    const payload = {
      pending: list.map((x) => ({ id: x.id, author: x.author || 'adam', text: x.text, ts: x.ts })),
      updatedAt: new Date().toISOString(),
    };
    window.__outboxPayload = payload;
    scheduleOutboxHint();
    if (openTelegramWithText(text)) {
      toast('Skopiowano + otwarto Telegram (share)');
    } else {
      toast('Skopiowano + w kolejce mostu (bridge wyśle gdy outbox w repo)');
    }
  }

  function bindUI() {
    // tabs
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        document.querySelectorAll('.panel').forEach((p) => {
          const on = p.id === 'panel-' + tab.dataset.tab;
          p.classList.toggle('active', on);
          p.hidden = !on;
        });
      });
    });

    // chips
    $('chips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const prefix = btn.dataset.prefix || '';
      const cur = inputEl.value;
      if (!cur.startsWith(prefix.trim())) {
        inputEl.value = prefix + cur.replace(/^(bestia|proxy|grok|haos)\s+/i, '');
      }
      inputEl.focus();
      autoSize();
    });

    // composer
    $('composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value;
      sendMessage(text, 'adam');
      inputEl.value = '';
      autoSize();
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('composer').requestSubmit();
      }
    });
    inputEl.addEventListener('input', autoSize);

    $('btnCopyTg').addEventListener('click', async () => {
      await flushOutboxToClipboardOrBridge();
    });
    const btnSendTg = $('btnSendTg');
    if (btnSendTg) {
      btnSendTg.addEventListener('click', async () => {
        await flushOutboxToClipboardOrBridge();
      });
    }

    // tasks
    $('taskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('taskTitle').value.trim();
      if (!title) return;
      state.tasks.push({
        id: uid(),
        title,
        status: 'todo',
        assignee: $('taskAssignee').value,
        ts: Date.now(),
      });
      $('taskTitle').value = '';
      persist(true);
      renderTasks();
      toast('Dodano zadanie');
    });

    $('board').addEventListener('click', (e) => {
      const move = e.target.closest('[data-move]');
      if (move) {
        const t = state.tasks.find((x) => x.id === move.dataset.id);
        if (t) {
          t.status = move.dataset.move;
          persist(true);
          renderTasks();
        }
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        state.tasks = state.tasks.filter((x) => x.id !== del.dataset.del);
        persist(true);
        renderTasks();
      }
    });

    $('btnExportTasks').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ roomId: cfg.roomId, tasks: state.tasks, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `most-tasks-${cfg.roomId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Wyeksportowano zadania');
    });
    $('btnImportTasks').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (Array.isArray(data)) state.tasks = data;
        else if (Array.isArray(data.tasks)) state.tasks = data.tasks;
        else throw new Error('zły format');
        persist(true);
        renderTasks();
        toast('Zaimportowano zadania');
      } catch {
        toast('Nie udało się zaimportować JSON');
      }
      e.target.value = '';
    });

    // drawer
    $('btnMenu').addEventListener('click', () => { $('drawer').hidden = false; });
    $('btnCloseDrawer').addEventListener('click', () => { $('drawer').hidden = true; });
    $('drawerBackdrop').addEventListener('click', () => { $('drawer').hidden = true; });
    $('btnSaveCfg').addEventListener('click', () => {
      const newRoom = ($('cfgRoomId').value || 'most-adam').trim();
      const roomChanged = newRoom !== cfg.roomId;
      cfg.roomId = newRoom;
      cfg.tgLink = ($('cfgTgLink').value || 'https://t.me/').trim();
      cfg.pollRoom = $('cfgPollRoom').checked;
      cfg.presence = { ...cfg.presence, adam: $('cfgPresence').value };
      saveCfg();
      if (roomChanged) state = loadState(cfg.roomId);
      seedWelcome();
      persist(true);
      renderAll();
      restartPoll();
      $('drawer').hidden = true;
      toast('Zapisano ustawienia');
    });
    $('btnClearAll').addEventListener('click', () => {
      if (!confirm('Wyczyścić wiadomości i zadania w tym pokoju?')) return;
      state = { messages: [], tasks: [], updatedAt: new Date().toISOString() };
      persist(true);
      seedWelcome();
      renderAll();
      toast('Wyczyszczono');
    });

    // sync modal
    $('btnSync').addEventListener('click', () => {
      $('snapshotBox').value = JSON.stringify({
        roomId: cfg.roomId,
        presence: cfg.presence,
        messages: state.messages,
        tasks: state.tasks,
        updatedAt: state.updatedAt,
        outbox: window.__outboxPayload || { pending: window.__pendingOutbox || [], updatedAt: new Date().toISOString() },
        v: 2,
      }, null, 2);
      $('syncModal').hidden = false;
    });
    $('btnCloseSync').addEventListener('click', () => { $('syncModal').hidden = true; });
    $('btnCopySnap').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('snapshotBox').value);
        toast('Snapshot skopiowany');
      } catch {
        $('snapshotBox').select();
        document.execCommand('copy');
        toast('Snapshot skopiowany');
      }
    });
    $('btnApplySnap').addEventListener('click', () => {
      try {
        const data = JSON.parse($('snapshotBox').value);
        if (data.roomId) {
          cfg.roomId = data.roomId;
          saveCfg();
        }
        if (data.presence) cfg.presence = { ...cfg.presence, ...data.presence };
        state.messages = Array.isArray(data.messages) ? data.messages : state.messages;
        state.tasks = Array.isArray(data.tasks) ? data.tasks : state.tasks;
        persist(true);
        renderAll();
        $('syncModal').hidden = true;
        toast('Zastosowano snapshot');
      } catch {
        toast('Błędny JSON snapshotu');
      }
    });
  }

  function lastAdamCommand() {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.author === 'adam') return m.text;
    }
    return '';
  }

  function autoSize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(120, inputEl.scrollHeight) + 'px';
  }


  /** Prefer live GitHub Pages. Skip relative fallback on Capacitor / github.io host. */
  function preferLiveOnly() {
    try {
      if (typeof window !== 'undefined' && window.Capacitor) return true;
      const h = (location && location.hostname) || '';
      if (h.includes('github.io')) return true;
    } catch (_) {}
    return false;
  }

  async function fetchLiveJson(relPath) {
    const bust = '?t=' + Date.now();
    const path = relPath.startsWith('/') ? relPath : '/' + relPath;
    const urls = [LIVE_BASE + path + bust];
    if (!preferLiveOnly()) urls.push('.' + path + bust);
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (_) { /* try next */ }
    }
    return null;
  }

  function hasTgDeepLink() {
    const link = (cfg.tgLink || '').trim();
    return !!(link && link !== 'https://t.me/' && link !== 'https://t.me');
  }

  function openTelegramWithText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (!hasTgDeepLink()) {
      toast('ustaw deep link grupy');
      return false;
    }
    const link = (cfg.tgLink || '').trim();
    const encoded = encodeURIComponent(trimmed);
    // Share sheet with deep-link / invite URL + message text (works in Capacitor via external browser/TG)
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encoded;
    try {
      const w = window.open(url, '_blank');
      if (!w) window.location.href = url;
    } catch (_) {
      try { window.location.href = url; } catch (__) {}
    }
    return true;
  }

  // --- poll room.json + bridge status (default every 4s) ---
  let lastBridgeSync = null;

  function restartPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (!cfg.pollRoom) return;
    const tick = async () => {
      try {
        const data = await fetchLiveJson('/data/room.json');
        if (!data) return;
        // Merge remote presence without wiping local adam
        if (data.presence) {
          cfg.presence = {
            ...cfg.presence,
            haos: data.presence.haos || cfg.presence.haos,
            proxy: data.presence.proxy || cfg.presence.proxy,
            bestia: data.presence.bestia || cfg.presence.bestia,
          };
          renderPresence();
        }
        if (data.bridge && data.bridge.lastSyncAt) {
          lastBridgeSync = data.bridge.lastSyncAt;
          updateBridgeStatusUI();
        }
        if (Array.isArray(data.messages) && data.messages.length) {
          let added = 0;
          const ids = new Set(state.messages.map((m) => m.id));
          for (const m of data.messages) {
            if (m.id && !ids.has(m.id)) {
              const merged = { ...m };
              // Normalize ts from bridge `at` (ISO) when ts missing
              if (merged.ts == null && merged.at) {
                const parsed = Date.parse(merged.at);
                if (!Number.isNaN(parsed)) merged.ts = parsed;
              }
              // Bridge / telegram messages: never tag as "manual / next wave"
              if (merged.source === 'telegram' || merged.source === 'outbox' || (merged.tag && /telegram/i.test(merged.tag))) {
                // keep bridge tag as-is
              } else if (!merged.tag) {
                merged.tag = 'z room.json';
              }
              if (merged.tag === 'manual / next wave' && (merged.source === 'telegram' || merged.source === 'outbox')) {
                delete merged.tag;
              }
              state.messages.push(merged);
              added++;
            }
          }
          if (added) {
            // stable sort by ts
            state.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
            persist(true);
            renderMessages();
            toast(`Most: +${added} z Telegrama / room.json`);
          }
        }
      } catch (_) { /* offline ok */ }
      // bridge status sidecar (live Pages first)
      try {
        const st = await fetchLiveJson('/data/bridge_status.json');
        if (st) {
          if (st.lastSyncAt) lastBridgeSync = st.lastSyncAt;
          window.__bridgeStatus = st;
          updateBridgeStatusUI();
        }
      } catch (_) {}
    };
    tick();
    pollTimer = setInterval(tick, 4000);
  }

  function updateBridgeStatusUI() {
    const st = window.__bridgeStatus || {};
    const sync = lastBridgeSync || st.lastSyncAt;
    let syncLabel = 'jeszcze nie';
    if (sync) {
      try {
        syncLabel = new Date(sync).toLocaleString('pl-PL');
      } catch { syncLabel = String(sync); }
    }
    const bot = st.botUsername ? '@' + st.botUsername : '—';
    const chat = st.chatTitle || (st.chatId ? String(st.chatId) : 'niepodłączona');
    const run = st.running ? 'działa' : 'offline';
    const err = st.lastError ? String(st.lastError) : null;
    const line = err
      ? `Bot ${bot} · ERROR: ${err} · lastSync: ${syncLabel}`
      : `Bot ${bot} · most ${run} · grupa: ${chat} · lastSync: ${syncLabel}`;

    const el = $('bridgeStatusLine');
    if (el) el.textContent = line;

    const banner = $('bridgeBanner');
    const bannerText = $('bridgeBannerText');
    if (banner && bannerText) {
      banner.hidden = false;
      banner.dataset.state = err ? 'err' : (st.running && st.chatId ? 'ok' : 'warn');
      bannerText.textContent = err
        ? `${bot} · lastSync ${syncLabel} · ${err}`
        : `${bot} · lastSync ${syncLabel} · ${run} · ${chat}`;
    }

    const badge = $('bridgeLiveBadge');
    if (badge) {
      badge.className = 'badge ' + (err ? 'err' : (st.running && st.chatId ? 'ok' : 'warn'));
      badge.textContent = err ? 'bridge error' : (st.running && st.chatId ? 'live bridge' : (st.running ? 'bridge: czekam na grupę' : 'bridge offline'));
    }
    const cfgSt = $('cfgBridgeStatus');
    if (cfgSt) {
      cfgSt.textContent = 'Status mostu: ' + line;
    }
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $('btnInstall').hidden = false;
    });
    $('btnInstall').addEventListener('click', async () => {
      if (!deferredPrompt) { toast('Instalacja: menu przeglądarki → Dodaj do ekranu głównego'); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('btnInstall').hidden = true;
    });
  }
})();
