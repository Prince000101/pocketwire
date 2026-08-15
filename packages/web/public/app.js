"use strict";

const TOKEN_KEY = "pocketwire.token";
const SESSION_KEY = "pocketwire.session";
const SERVER_KEY = "pocketwire.server";

const NATIVE = typeof window.Capacitor !== "undefined" && !!window.Capacitor.isNativePlatform?.();
const $ = (id) => document.getElementById(id);

function base() {
  if (NATIVE) return (state.server || "").replace(/\/+$/, "");
  return location.origin;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FG = { 30: "#c9d1d9", 31: "#ff6b6b", 32: "#5fd68a", 33: "#ffd479", 34: "#79b8ff", 35: "#d2a8ff", 36: "#56d4dd", 37: "#e6edf3", 90: "#8b949e", 91: "#ff7b72", 92: "#7ee787", 93: "#ffd479", 94: "#79b8ff", 95: "#d2a8ff", 96: "#76e3ea", 97: "#ffffff" };
const BG = { 40: "#0b0e14", 41: "#3a2e2e", 42: "#1f2b24", 43: "#332c1d", 44: "#1c2733", 45: "#2c1f33", 46: "#1c2b2d", 47: "#e6edf3" };

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
      } else if (FG[code]) {
        out += `<span style="color:${FG[code]}">`;
        stack.push(1);
      } else if (BG[code]) {
        out += `<span style="background:${BG[code]}">`;
        stack.push(1);
      }
    }
  }
  out += esc(text.slice(last));
  while (stack.length) { out += "</span>"; stack.pop(); }
  return out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

const state = {
  token: "",
  server: NATIVE ? localStorage.getItem(SERVER_KEY) || "" : "",
  seen: new Set(),
  es: null,
  skills: [],
  statusTimer: null,
  connected: false,
  nearBottom: true,
  sessions: [],
  session: "",
  run: null,
};

function api(path, opts = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const headers = { ...(opts.headers || {}) };
  headers["Authorization"] = `Bearer ${state.token}`;
  return fetch(`${base()}/api/${path}${sep}token=${encodeURIComponent(state.token)}`, { ...opts, headers });
}

/* ---------- boot / pairing ---------- */

function boot() {
  wireNative();
  if (NATIVE) {
    document.body.classList.add("native");
    $("server-field").hidden = false;
    $("set-server-field").hidden = false;
    $("onboard-step1").textContent = "Enter the relay URL (shown on your PC's pair page) and the access token below.";
    $("pair-hint").textContent = "On your PC, the relay prints the URL and token at startup — or run it with publicUrl set and open the pair page.";
  }
  const urlToken = new URLSearchParams(location.search).get("token");
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    history.replaceState({}, "", location.pathname);
  }
  state.session = localStorage.getItem(SESSION_KEY) || "";
  state.token = localStorage.getItem(TOKEN_KEY) || "";
  if (NATIVE) state.server = localStorage.getItem(SERVER_KEY) || "";
  if (!state.token || (NATIVE && !state.server)) {
    showOnboard();
    return;
  }
  hideOnboard();
  start();
}

function wireNative() {
  if (!window.Capacitor) return;
  document.title = "pocketwire";
  window.Capacitor.Plugins.App.addListener("appUrlOpen", (data) => {
    try {
      const q = new URL(data.url).searchParams;
      const s = q.get("server");
      const t = q.get("token");
      if (s) localStorage.setItem(SERVER_KEY, s);
      if (t) localStorage.setItem(TOKEN_KEY, t);
      if (s || t) location.reload();
    } catch {}
  });
}

async function verifyToken(token) {
  const res = await fetch(`${base()}/api/status?token=${encodeURIComponent(token)}`);
  return res.ok;
}

function showOnboard() {
  $("onboard").hidden = false;
  setTimeout(() => $("tok-input").focus(), 50);
}
function hideOnboard() {
  $("onboard").hidden = true;
}

$("btn-tok").addEventListener("click", onTokenSubmit);
$("tok-input").addEventListener("keydown", (e) => { if (e.key === "Enter") onTokenSubmit(); });

async function onTokenSubmit() {
  const token = $("tok-input").value.trim();
  const server = NATIVE ? $("server-input").value.trim() : "";
  if (!token) return;
  if (NATIVE) {
    if (!server) {
      $("tok-error").textContent = "Enter the relay URL (e.g. http://mypc.tailnet.ts.net:8787).";
      $("tok-error").classList.remove("hidden");
      return;
    }
    state.server = server.replace(/\/+$/, "");
    localStorage.setItem(SERVER_KEY, state.server);
  }
  if (await verifyToken(token)) {
    state.token = token;
    localStorage.setItem(TOKEN_KEY, token);
    hideOnboard();
    start();
  } else {
    $("tok-error").textContent = "Invalid token or unreachable relay.";
    $("tok-error").classList.remove("hidden");
  }
}

/* ---------- status / connection ---------- */

function setConn(on) {
  state.connected = on;
  $("status-dot").className = `dot ${on ? "on" : "off"}`;
  $("conn-label").textContent = on ? "live" : "offline";
  setBanner(on ? null : "Connection lost — reconnecting…");
}

function setBanner(text) {
  const b = $("banner");
  if (!text) {
    b.classList.add("hidden");
    b.textContent = "";
  } else {
    b.textContent = text;
    b.classList.remove("hidden");
  }
}

async function refreshStatus() {
  try {
    const res = await api("status");
    if (!res.ok) return;
    const s = await res.json();
    $("meta-agent").textContent = s.agents.length ? s.agents.join(", ") : "no agent";
    state.sessions = s.sessions || [];
    refreshSessions();
    if (!s.agents.length && feed().children.length === 0) {
      $("empty").classList.remove("hidden");
    } else {
      $("empty").classList.add("hidden");
    }
  } catch {
    /* offline */
  }
}

function refreshSessions() {
  const btn = $("btn-sessions");
  btn.textContent = state.session ? shortId(state.session) : "all sessions";
  btn.classList.toggle("active", Boolean(state.session));
  const sel = $("set-session");
  const prev = sel.value;
  sel.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "auto (most recent)";
  sel.appendChild(auto);
  for (const s of state.sessions) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = shortId(s);
    sel.appendChild(opt);
  }
  sel.value = prev || state.session || "";
}

function shortId(id) {
  if (!id) return "all sessions";
  return id.length > 12 ? id.slice(0, 6) + "…" + id.slice(-4) : id;
}

async function loadSkills() {
  try {
    const res = await api("skills");
    if (!res.ok) return;
    const { skills } = await res.json();
    state.skills = skills;
    const chips = $("chips");
    chips.replaceChildren();
    for (const skill of skills) {
      const el = document.createElement("button");
      el.className = "skill-chip";
      el.textContent = `/${skill.name}`;
      el.title = skill.description || "";
      el.dataset.skill = skill.name;
      el.addEventListener("click", () => {
        const input = $("input");
        input.value += `/${skill.name} `;
        input.focus();
        el.classList.add("used");
      });
      chips.appendChild(el);
    }
  } catch {
    /* offline */
  }
}

/* ---------- feed / run grouping ---------- */

function feed() {
  return $("feed");
}

function startRun(ev) {
  const run = document.createElement("div");
  run.className = "run running";
  const time = new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  run.innerHTML = `<div class="run-head"><span class="prompt">${esc(ev.message || ev.title || "")}</span><span class="t">${time}</span></div><div class="run-body"></div>`;
  feed().appendChild(run);
  state.run = { el: run, body: run.querySelector(".run-body") };
}

function endRun() {
  if (state.run) {
    state.run.el.classList.remove("running");
    state.run = null;
  }
}

function currentRunTarget() {
  if (state.run && state.run.body) {
    return state.run.body;
  }
  const holder = document.createElement("div");
  holder.className = "run";
  holder.innerHTML = `<div class="run-body"></div>`;
  feed().appendChild(holder);
  return holder.querySelector(".run-body");
}

function appendEvent(ev) {
  if (state.seen.has(ev.id)) return;
  state.seen.add(ev.id);
  if (state.seen.size > 1500) {
    const it = state.seen.values();
    for (let i = 0; i < 300; i++) it.next();
    state.seen.delete(it.next().value);
  }

  $("empty").classList.add("hidden");

  if (ev.kind === "instruction.received" || ev.kind === "command.request") {
    endRun();
    startRun(ev);
    return;
  }
  if (ev.kind === "agent.idle" || ev.kind === "agent.done") {
    endRun();
  }
  if (ev.kind === "approval.request") {
    showApproval(ev);
  }

  const f = feed();
  const near = f.scrollHeight - f.scrollTop - f.clientHeight < 80;
  const target = currentRunTarget();
  target.appendChild(renderEvent(ev));
  while (f.children.length > 300) f.removeChild(f.firstChild);
  if (near) f.scrollTop = f.scrollHeight;
}

function renderEvent(ev) {
  const el = document.createElement("div");
  el.className = "ev";
  el.dataset.id = ev.id;
  const time = new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const head = `<div class="ev-head"><span class="t">${time}</span><span class="k ${esc(ev.kind)}">${esc(ev.kind.replace(/[._]/g, " "))}</span>${ev.agent ? `<span class="a">${esc(ev.agent)}</span>` : ""}</div>`;

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
      case "approval.request":
        el.innerHTML = `${head}<div class="msg">${esc(ev.message || "")}</div><div class="btns">${approvalButtons(ev)}</div>`;
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

function approvalButtons(ev) {
  const id = ev.data?.requestId;
  const options = ev.data?.options?.length ? ev.data.options : ["Allow", "Deny"];
  return options
    .map((o) => `<button class="btn ${String(o).toLowerCase() === "deny" ? "danger" : "primary"}" data-aid="${esc(id)}" data-ans="${esc(o)}">${esc(o)}</button>`)
    .join("");
}

/* ---------- approval modal ---------- */

let pendingApproval = null;

function showApproval(ev) {
  const id = ev.data?.requestId;
  const options = ev.data?.options?.length ? ev.data.options : ["Allow", "Deny"];
  pendingApproval = { id, options };
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

function hideApproval() {
  $("approval").hidden = true;
  pendingApproval = null;
}

async function respondApproval(requestId, answer) {
  try {
    await api("approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, answer }),
    });
  } catch {}
  hideApproval();
}

/* ---------- connect ---------- */

function connect() {
  if (state.es) state.es.close();
  const es = new EventSource(`${base()}/api/events?token=${encodeURIComponent(state.token)}`);
  state.es = es;
  es.onopen = () => setConn(true);
  es.onerror = () => setConn(false);
  es.onmessage = (e) => {
    try {
      appendEvent(JSON.parse(e.data));
    } catch {
      /* ignore */
    }
  };
}

/* ---------- actions ---------- */

async function sendPrompt(text) {
  const value = (text ?? $("input").value).trim();
  if (!value) return;
  try {
    await api("prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, session: state.session || undefined }),
    });
  } catch {
    /* offline */
  }
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
  try { await api("screenshot", { method: "POST" }); } catch {}
});
$("btn-abort").addEventListener("click", async () => {
  try { await api("abort", { method: "POST" }); } catch {}
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-aid]");
  if (!b) return;
  try {
    await api("approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: b.dataset.aid, answer: b.dataset.ans }),
    });
  } catch {}
  hideApproval();
});

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

/* ---------- settings ---------- */

$("btn-settings").addEventListener("click", () => {
  $("set-token").value = state.token;
  $("set-server").textContent = base() || "not set";
  $("set-server-input").value = state.server;
  refreshSessions();
  $("settings").hidden = false;
});
$("btn-close").addEventListener("click", () => { $("settings").hidden = true; });
$("btn-save").addEventListener("click", async () => {
  const token = $("set-token").value.trim();
  const session = $("set-session").value;
  const server = NATIVE ? $("set-server-input").value.trim() : "";
  if (NATIVE) {
    if (!server) {
      $("tok-error").textContent = "Enter the relay URL.";
      $("tok-error").classList.remove("hidden");
      return;
    }
    state.server = server.replace(/\/+$/, "");
    localStorage.setItem(SERVER_KEY, state.server);
  }
  state.session = session;
  localStorage.setItem(SESSION_KEY, session);
  if (token && (await verifyToken(token))) {
    localStorage.setItem(TOKEN_KEY, token);
    state.token = token;
    $("settings").hidden = true;
    start();
  } else {
    $("tok-error").textContent = "Invalid token or unreachable relay.";
    $("tok-error").classList.remove("hidden");
  }
});
$("btn-copy-token").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("set-token").value);
    $("btn-copy-token").textContent = "copied";
    setTimeout(() => ($("btn-copy-token").textContent = "copy"), 1200);
  } catch {}
});
$("btn-disconnect").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  state.token = "";
  $("settings").hidden = true;
  location.reload();
});

$("btn-sessions").addEventListener("click", () => {
  $("set-token").value = state.token;
  $("set-server").textContent = base() || "not set";
  $("set-server-input").value = state.server;
  refreshSessions();
  $("settings").hidden = false;
  $("set-session").scrollIntoView({ block: "center" });
});

/* ---------- start ---------- */

function start() {
  state.seen = new Set();
  state.run = null;
  feed().replaceChildren();
  connect();
  refreshStatus();
  loadSkills();
  state.statusTimer = setInterval(refreshStatus, 10000);
}

if ("serviceWorker" in navigator && !NATIVE) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}

boot();
