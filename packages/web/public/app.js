"use strict";

const TOKEN_KEY = "pocketwire.token";
const SERVER_KEY = "pocketwire.server";
const SERVERS_KEY = "pocketwire.servers";
const SESSION_KEY = "pocketwire.session";
const THEME_KEY = "pocketwire.theme";

const NATIVE = typeof window.Capacitor !== "undefined" && !!window.Capacitor.isNativePlatform?.();
const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ansiToHtml(input) {
  const text = String(input);
  const re = /\x1b\[([0-9;]*)m/g;
  let out = "";
  let last = 0;
  const stack = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    const params = (m[1] || "0").split(";").map(Number).filter((n) => !Number.isNaN(n));
    for (const code of params.length ? params : [0]) {
      if (code === 0) {
        while (stack.length) { out += "</span>"; stack.pop(); }
      } else if (code === 1 || code === 22 || code === 39) {
        continue;
      } else if (code >= 30 && code <= 37) {
        out += `<span style="color:var(--a${code})">`;
        stack.push(1);
      } else if (code >= 90 && code <= 97) {
        out += `<span style="color:var(--a${code})">`;
        stack.push(1);
      } else if (code >= 40 && code <= 47) {
        out += `<span style="background:var(--b${code})">`;
        stack.push(1);
      }
    }
  }
  out += esc(text.slice(last));
  while (stack.length) { out += "</span>"; stack.pop(); }
  return out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function clockFull(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function shortId(id) {
  if (!id) return "auto";
  return id.length > 12 ? id.slice(0, 6) + "…" + id.slice(-4) : id;
}
function chatKey(server, agentId) {
  return `${server.url}|${agentId}`;
}
function firstAgent(server) {
  return server.agents[0]?.id ?? "opencode";
}
function agentLabel(server, id) {
  const a = server.agents.find((x) => x.id === id);
  return a ? a.name : id;
}

const state = {
  servers: [],
  active: null, // chatKey
  session: localStorage.getItem(SESSION_KEY) || "",
  unread: {},
  runs: {},
  skills: [],
  skillsSearch: "",
  theme: localStorage.getItem(THEME_KEY) || "auto",
  statusTimer: null,
};

/* ---------- theme ---------- */

function applyTheme(theme) {
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#0b0e14" : "#f5f6f8";
  for (const b of document.querySelectorAll("#theme-seg button")) {
    b.classList.toggle("active", b.dataset.theme === theme);
  }
  renderFeed();
}

/* ---------- storage ---------- */

function loadServers() {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVERS_KEY) || "[]");
    if (Array.isArray(raw)) return raw.filter((s) => s && s.url && s.token);
  } catch {}
  const legacyUrl = localStorage.getItem(SERVER_KEY);
  const legacyToken = localStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    return [{ url: (legacyUrl || location.origin).replace(/\/+$/, ""), token: legacyToken }];
  }
  return [];
}

function saveServers() {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(state.servers.map((s) => ({ url: s.url, token: s.token }))));
}

function parsePairLink(input) {
  const s = String(input || "").trim();
  if (!s) return { server: "", token: "", agent: "" };
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    return {
      server: u.origin,
      token: u.searchParams.get("token") || u.searchParams.get("t") || "",
      agent: u.searchParams.get("agent") || "",
    };
  } catch {
    return { server: "", token: "", agent: "" };
  }
}

/* ---------- boot ---------- */

function boot() {
  wireNative();
  applyTheme(state.theme);
  const url = new URLSearchParams(location.search);
  const pair = parsePairLink(url.get("pair") || "");
  const qServer = url.get("server") || pair.server;
  const qToken = url.get("token") || pair.token;
  const qAgent = url.get("agent") || pair.agent;
  if (qServer && qToken) {
    addServer({ url: qServer, token: qToken });
    history.replaceState({}, "", location.pathname);
  }
  const migrated = loadServers();
  state.servers = migrated.map((s) => makeServer(s.url, s.token));
  if (state.servers.length === 0) {
    showOnboard();
    return;
  }
  hideOnboard();
  startAll();
  if (qAgent) {
    const server = state.servers[0];
    openChat(server, qAgent);
  }
}

function wireNative() {
  if (!window.Capacitor) return;
  document.title = "pocketwire";
  window.Capacitor.Plugins.App.addListener("appUrlOpen", (data) => {
    try {
      const q = new URL(data.url).searchParams;
      const s = q.get("server");
      const t = q.get("token");
      if (s && t) {
        addServer({ url: s, token: t });
        location.reload();
      }
    } catch {}
  });
}

function makeServer(url, token) {
  const clean = url.replace(/\/+$/, "");
  return {
    url: clean,
    token,
    agents: [],
    events: [],
    skills: [],
    es: null,
    connected: false,
    statusTimer: null,
    historyLoaded: false,
    lastId: "",
  };
}

function addServer({ url, token }) {
  const existing = state.servers.find((s) => s.url === url.replace(/\/+$/, ""));
  if (existing) {
    existing.token = token;
    return;
  }
  state.servers.push(makeServer(url, token));
}

function removeServer(server) {
  closeServer(server);
  state.servers = state.servers.filter((s) => s !== server);
  saveServers();
  if (state.active && !state.servers.some((s) => chatKey(s, agentOfChat(s)) === state.active)) {
    closeChat();
  }
  renderChats();
}

/* ---------- onboarding ---------- */

function showOnboard() {
  $("onboard").hidden = false;
}
function hideOnboard() {
  $("onboard").hidden = true;
}

$("btn-pair").addEventListener("click", async () => {
  const link = $("pair-input").value.trim();
  const parsed = parsePairLink(link);
  if (!parsed.server || !parsed.token) {
    $("pair-error").textContent = "Paste the full pair link from your PC (it contains the server URL and token).";
    $("pair-error").classList.remove("hidden");
    return;
  }
  $("pair-error").classList.add("hidden");
  addServer({ url: parsed.server, token: parsed.token });
  saveServers();
  const server = state.servers.find((s) => s.url === parsed.server);
  hideOnboard();
  startServer(server);
  void refreshStatus(server);
  if (parsed.agent) {
    openChat(server, parsed.agent);
  } else {
    renderChats();
  }
});

/* ---------- per-server connection ---------- */

function startAll() {
  state.statusTimer && clearInterval(state.statusTimer);
  state.statusTimer = setInterval(() => state.servers.forEach(refreshStatus), 10000);
  for (const server of state.servers) {
    startServer(server);
    void refreshStatus(server);
  }
  renderChats();
}

function startServer(server) {
  closeServer(server);
  void loadHistory(server).then(() => {
    if (server.es) return;
    const es = new EventSource(`${server.url}/api/events?token=${encodeURIComponent(server.token)}&since=${encodeURIComponent(server.lastId || "")}`);
    server.es = es;
    es.onopen = () => {
      server.connected = true;
      setConn(server, true);
    };
    es.onerror = () => {
      server.connected = false;
      setConn(server, false);
    };
    es.onmessage = (e) => {
      try {
        if (e.lastEventId && server.lastId !== e.lastEventId) server.lastId = e.lastEventId;
        handleEvent(server, JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
  });
  void loadSkills(server);
}

function closeServer(server) {
  if (server.es) {
    server.es.close();
    server.es = null;
  }
  if (server.statusTimer) clearInterval(server.statusTimer);
  server.statusTimer = null;
}

async function loadHistory(server) {
  try {
    const res = await fetch(`${server.url}/api/history?token=${encodeURIComponent(server.token)}`);
    if (!res.ok) return;
    const { events } = await res.json();
    if (Array.isArray(events)) {
      server.lastId = events.length ? events[events.length - 1].id || "" : "";
      for (const ev of events) handleEvent(server, ev, true);
    }
  } catch {}
}

async function refreshStatus(server) {
  try {
    const res = await fetch(`${server.url}/api/status?token=${encodeURIComponent(server.token)}`);
    if (!res.ok) return;
    const s = await res.json();
    server.agents = Array.isArray(s.agents) ? s.agents : [{ id: "opencode", name: "opencode", kind: "opencode", sessions: s.sessions || [] }];
    renderChats();
    renderChatHeader();
    refreshSessions();
  } catch {
    /* offline */
  }
}

async function loadSkills(server) {
  try {
    const res = await fetch(`${server.url}/api/skills?token=${encodeURIComponent(server.token)}`);
    if (!res.ok) return;
    const { skills } = await res.json();
    server.skills = Array.isArray(skills) ? skills : [];
  } catch {}
}

function serverApi(server, path, opts = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const headers = { ...(opts.headers || {}) };
  headers["Authorization"] = `Bearer ${server.token}`;
  return fetch(`${server.url}/api/${path}${sep}token=${encodeURIComponent(server.token)}`, { ...opts, headers });
}

/* ---------- connection banner ---------- */

function setConn(server, on) {
  const b = $("banner");
  const msg = on ? null : `Connection lost — reconnecting… (${server.url.replace(/^https?:\/\//, "")})`;
  if (!msg) {
    if (!state.servers.some((s) => !s.connected)) {
      b.classList.add("hidden");
      b.textContent = "";
    }
  } else {
    b.textContent = msg;
    b.classList.remove("hidden");
  }
  renderChats();
  renderChatHeader();
}

/* ---------- chat list ---------- */

function chats() {
  const out = [];
  for (const server of state.servers) {
    for (const agent of server.agents) {
      out.push({ server, agent });
    }
  }
  return out;
}

function lastEvent(server, agentId) {
  const list = server.events.filter((e) => (e.agent || firstAgent(server)) === agentId);
  return list[list.length - 1];
}

function previewFor(ev) {
  if (!ev) return "";
  switch (ev.kind) {
    case "agent.output":
      return ev.message || ev.title || "output";
    case "agent.tool":
      return `⚙ ${ev.title || ev.message || "tool"}`;
    case "agent.error":
      return `⚠ ${ev.message || "error"}`;
    case "agent.idle":
      return "idle";
    case "agent.done":
      return "done";
    case "instruction.received":
    case "command.request":
      return `→ ${ev.message || ""}`;
    case "screenshot.taken":
      return "📷 screenshot";
    default:
      return ev.message || ev.title || ev.kind;
  }
}

function renderChats() {
  const list = $("chat-list");
  list.replaceChildren();
  const items = chats();
  $("chats-empty").classList.toggle("hidden", items.length > 0);
  items.sort((a, b) => {
    const ta = lastEvent(a.server, a.agent.id)?.ts ?? 0;
    const tb = lastEvent(b.server, b.agent.id)?.ts ?? 0;
    return tb - ta;
  });
  for (const { server, agent } of items) {
    const key = chatKey(server, agent.id);
    const li = document.createElement("li");
    li.className = "chat-row";
    const ev = lastEvent(server, agent.id);
    const unread = state.unread[key] || 0;
    const name = agent.name || agent.id;
    li.innerHTML = `
      <span class="avatar">${esc((name[0] || "A").toUpperCase())}</span>
      <div class="chat-row-main">
        <div class="chat-row-top">
          <span class="chat-row-name">${esc(name)}</span>
          <span class="chat-row-time">${ev ? clock(ev.ts) : ""}</span>
        </div>
        <div class="chat-row-preview">
          <span class="prev">${esc(previewFor(ev)) || "no messages yet"}</span>
          ${unread ? `<span class="badge">${unread}</span>` : ""}
        </div>
      </div>`;
    li.addEventListener("click", () => openChat(server, agent.id));
    list.appendChild(li);
  }
}

/* ---------- chat view ---------- */

function agentOfChat(server) {
  if (!state.active) return firstAgent(server);
  return state.active.split("|")[1];
}

function openChat(server, agentId) {
  state.active = chatKey(server, agentId);
  $("chats-view").classList.add("hidden");
  $("chat-view").classList.remove("hidden");
  state.unread[state.active] = 0;
  renderChatHeader();
  renderFeed();
  void refreshStatus(server);
  refreshSessions();
}

function closeChat() {
  state.active = null;
  $("chat-view").classList.add("hidden");
  $("chats-view").classList.remove("hidden");
  renderChats();
}

$("btn-back").addEventListener("click", closeChat);
$("btn-chat-more").addEventListener("click", openSettings);

function activeServer() {
  if (!state.active) return undefined;
  const key = state.active;
  return state.servers.find((s) => chatKey(s, agentOfChat(s)) === key) || state.servers[0];
}
function activeAgentId() {
  return state.active ? state.active.split("|")[1] : undefined;
}

function renderChatHeader() {
  const server = activeServer();
  const agentId = activeAgentId();
  if (!server || !agentId) return;
  const label = agentLabel(server, agentId);
  $("chat-avatar").textContent = (label[0] || "A").toUpperCase();
  $("chat-name").textContent = label;
  const st = $("chat-status");
  if (!server.connected) {
    st.textContent = "connecting…";
    st.className = "chat-status";
  } else {
    st.textContent = "live";
    st.className = "chat-status live";
  }
}

function agentEvents(server) {
  const agentId = activeAgentId();
  if (!agentId) return [];
  return server.events.filter((e) => (e.agent || firstAgent(server)) === agentId);
}

function renderFeed() {
  const server = activeServer();
  if (!server) return;
  const feed = $("feed");
  feed.replaceChildren();
  state.runs = {};
  const list = agentEvents(server);
  for (const ev of list) appendEvent(server, ev, true);
  if (list.length === 0) {
    $("chat-empty").classList.remove("hidden");
  } else {
    $("chat-empty").classList.add("hidden");
  }
}

/* ---------- event handling ---------- */

function handleEvent(server, ev, isHistory) {
  if (!ev || typeof ev !== "object" || !ev.kind) return;
  ev.agent = ev.agent || firstAgent(server);
  server.events.push(ev);
  const key = chatKey(server, ev.agent);
  const active = state.active === key;
  if (!isHistory) {
    if (!active) state.unread[key] = (state.unread[key] || 0) + 1;
    if (ev.kind === "approval.request") showApproval(server, ev);
  }
  if (active && !isHistory) appendEvent(server, ev);
  if (active) {
    $("chat-empty").classList.add("hidden");
  }
  renderChats();
}

function startRun(server, ev) {
  const feed = $("feed");
  const run = document.createElement("div");
  run.className = "run running";
  const time = clock(ev.ts);
  run.innerHTML = `<div class="run-head"><span class="prompt">${esc(ev.message || ev.title || "")}</span><span class="t">${time}</span></div><div class="run-body"></div>`;
  feed.appendChild(run);
  state.runs[state.active] = { el: run, body: run.querySelector(".run-body") };
}

function endRun() {
  const run = state.runs[state.active];
  if (run) {
    run.el.classList.remove("running");
    delete state.runs[state.active];
  }
}

function appendEvent(server, ev, isHistory) {
  const feed = $("feed");
  const near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  if (ev.kind === "instruction.received" || ev.kind === "command.request") {
    startRun(server, ev);
  }
  if (ev.kind === "agent.idle" || ev.kind === "agent.done") {
    endRun();
  }
  const run = state.runs[state.active];
  const target = run ? run.body : feed;
  target.appendChild(renderEvent(ev));
  while (feed.children.length > 300) feed.removeChild(feed.firstChild);
  if (near) feed.scrollTop = feed.scrollHeight;
}

function renderEvent(ev) {
  const el = document.createElement("div");
  el.className = "ev";
  const time = clockFull(ev.ts);
  const head = `<div class="ev-head"><span class="t">${time}</span><span class="k ${esc(ev.kind)}">${esc(ev.kind.replace(/[._]/g, " "))}</span></div>`;

  if (ev.image) {
    el.innerHTML = `${head}<div class="shot"><img src="data:${esc(ev.image.mime)};base64,${ev.image.data}" alt="screenshot" /></div>`;
  } else {
    switch (ev.kind) {
      case "agent.output":
        el.innerHTML = `${head}<pre class="out">${ansiToHtml((ev.detail ?? ev.message ?? "").slice(0, 12000))}</pre>`;
        break;
      case "agent.tool":
        el.innerHTML = `${head}<div class="msg">${esc(ev.title || ev.message || "")} ${ev.data ? `<code>${esc(JSON.stringify(ev.data)).slice(0, 1500)}</code>` : ""}</div>`;
        break;
      case "agent.error":
        el.innerHTML = `${head}<div class="msg err">${esc(ev.detail || ev.message || "")}</div>`;
        break;
      case "instruction.received":
      case "command.request":
        el.innerHTML = `${head}<div class="msg outgoing">${esc(ev.message || "")}</div>`;
        break;
      case "control.abort":
        el.innerHTML = `${head}<div class="msg warn">abort requested</div>`;
        break;
      default:
        el.innerHTML = `${head}${ev.message || ev.title ? `<div class="msg">${esc(ev.message || ev.title)}</div>` : ""}`;
    }
  }
  return el;
}

/* ---------- approval ---------- */

let pendingApproval = null;

function showApproval(server, ev) {
  const id = ev.data?.requestId;
  const options = ev.data?.options?.length ? ev.data.options : ["Allow", "Deny"];
  pendingApproval = { server, id, options };
  $("approval-q").textContent = ev.message || ev.title || "Requesting permission…";
  const btns = $("approval-btns");
  btns.replaceChildren();
  for (const o of options) {
    const b = document.createElement("button");
    b.className = `btn ${String(o).toLowerCase() === "deny" ? "danger" : "primary"}`;
    b.textContent = o;
    b.addEventListener("click", () => respondApproval(id, o));
    btns.appendChild(b);
  }
  $("approval").hidden = false;
}

async function respondApproval(requestId, answer) {
  const { server } = pendingApproval || {};
  if (server && requestId) {
    try {
      await serverApi(server, "approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, answer }),
      });
    } catch {}
  }
  $("approval").hidden = true;
  pendingApproval = null;
}

/* ---------- composer ---------- */

async function sendPrompt(text) {
  const server = activeServer();
  const agentId = activeAgentId();
  if (!server || !agentId) return;
  const value = (text ?? $("input").value).trim();
  if (!value) return;
  try {
    await serverApi(server, "prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, session: state.session || undefined, agent: agentId }),
    });
  } catch {}
  $("input").value = "";
  $("input").style.height = "";
}

$("btn-send").addEventListener("click", () => sendPrompt());
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});
$("input").addEventListener("input", (e) => {
  e.target.style.height = "";
  e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
});

$("btn-continue").addEventListener("click", () => sendPrompt("continue"));
$("btn-screenshot").addEventListener("click", async () => {
  const server = activeServer();
  const agentId = activeAgentId();
  if (!server || !agentId) return;
  try {
    await serverApi(server, "screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent: agentId }) });
  } catch {}
});
$("btn-abort").addEventListener("click", async () => {
  const server = activeServer();
  const agentId = activeAgentId();
  if (!server || !agentId) return;
  try {
    await serverApi(server, "abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent: agentId }) });
  } catch {}
});

/* ---------- skills sheet ---------- */

function openSkills() {
  const server = activeServer();
  if (!server) return;
  state.skills = server.skills || [];
  $("skills-search").value = state.skillsSearch;
  renderSkills();
  $("skills-sheet").hidden = false;
}

function renderSkills() {
  const list = $("skills-list");
  list.replaceChildren();
  const q = state.skillsSearch.trim().toLowerCase();
  const items = state.skills.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  if (items.length === 0) {
    const el = document.createElement("div");
    el.className = "skills-empty";
    el.textContent = "no skills found";
    list.appendChild(el);
    return;
  }
  for (const skill of items) {
    const card = document.createElement("div");
    card.className = "skill-card";
    card.innerHTML = `
      <div class="sc-main">
        <span class="sc-name">/${esc(skill.name)}</span>
        ${skill.description ? `<span class="sc-desc">${esc(skill.description)}</span>` : ""}
      </div>
      <span class="sc-src">${esc(skill.source || "skill")}</span>`;
    card.addEventListener("click", () => {
      $("skills-sheet").hidden = true;
      void sendPrompt(`/${skill.name}`);
    });
    list.appendChild(card);
  }
}

$("btn-skills").addEventListener("click", openSkills);
$("btn-skills-close").addEventListener("click", () => { $("skills-sheet").hidden = true; });
$("skills-search").addEventListener("input", (e) => {
  state.skillsSearch = e.target.value;
  renderSkills();
});

/* ---------- settings ---------- */

function openSettings() {
  renderServers();
  refreshSessions();
  applyTheme(state.theme);
  $("settings").hidden = false;
}

$("btn-settings").addEventListener("click", openSettings);
$("btn-chat-more").addEventListener("click", openSettings);
$("btn-add-server").addEventListener("click", () => {
  $("add-server").classList.remove("hidden");
  $("set-pair-link").focus();
});
$("btn-close").addEventListener("click", () => { $("settings").hidden = true; });

document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-close]");
  if (c) $(c.dataset.close).hidden = true;
});

$("btn-add-server-save").addEventListener("click", () => {
  const parsed = parsePairLink($("set-pair-link").value);
  if (!parsed.server || !parsed.token) {
    alert("Paste the full pair link (server URL + token).");
    return;
  }
  addServer({ url: parsed.server, token: parsed.token });
  saveServers();
  $("set-pair-link").value = "";
  const server = state.servers.find((s) => s.url === parsed.server);
  startServer(server);
  void refreshStatus(server);
  renderServers();
  renderChats();
  $("add-server").classList.add("hidden");
});

function renderServers() {
  const list = $("servers-list");
  list.replaceChildren();
  for (const server of state.servers) {
    const row = document.createElement("div");
    row.className = "server-row";
    row.innerHTML = `
      <span class="s-dot ${server.connected ? "on" : "off"}"></span>
      <span class="s-url">${esc(server.url)}</span>
      <span class="faint" style="font-size:0.68rem">${server.agents.length} agent${server.agents.length === 1 ? "" : "s"}</span>
      <button class="s-remove" title="Remove">&#215;</button>`;
    row.querySelector(".s-remove").addEventListener("click", () => removeServer(server));
    list.appendChild(row);
  }
}

function refreshSessions() {
  const sel = $("set-session");
  const prev = sel.value;
  sel.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "auto (most recent)";
  sel.appendChild(auto);
  const server = activeServer();
  const agentId = activeAgentId();
  const sessions = server && agentId ? (server.agents.find((a) => a.id === agentId)?.sessions ?? []) : [];
  for (const s of sessions) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = shortId(s);
    sel.appendChild(opt);
  }
  sel.value = prev || state.session || "";
}

$("btn-save").addEventListener("click", () => {
  state.session = $("set-session").value;
  localStorage.setItem(SESSION_KEY, state.session);
  $("settings").hidden = true;
});

$("btn-disconnect").addEventListener("click", () => {
  const server = activeServer();
  if (server) {
    removeServer(server);
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

$("theme-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-theme]");
  if (!b) return;
  state.theme = b.dataset.theme;
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme(state.theme);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "auto") applyTheme(state.theme);
});

/* ---------- misc ---------- */

$("lightbox").addEventListener("click", () => { $("lightbox").hidden = true; });
document.addEventListener("click", (e) => {
  const img = e.target.closest("#feed img");
  if (!img) return;
  const lb = $("lightbox");
  lb.replaceChildren();
  const big = document.createElement("img");
  big.src = img.src;
  big.alt = "screenshot";
  lb.appendChild(big);
  lb.hidden = false;
});

$("btn-pair-cta").addEventListener("click", () => {
  $("chats-view").classList.add("hidden");
  $("onboard").hidden = false;
});

if ("serviceWorker" in navigator && !NATIVE) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}

boot();
