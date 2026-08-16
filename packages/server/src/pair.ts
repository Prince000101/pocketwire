import QRCode from "qrcode";
import { VERSION } from "@pocketwire/core";

export function pairUrl(token: string, publicUrl?: string): string | undefined {
  const base = (publicUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return undefined;
  return `${base}/?token=${encodeURIComponent(token)}`;
}

export async function terminalQr(text: string): Promise<string> {
  return QRCode.toString(text, { type: "terminal" });
}

export async function pairPageHtml(url: string | undefined, token: string): Promise<string> {
  const svg = url ? await QRCode.toString(url, { type: "svg", margin: 2, width: 640, color: { dark: "#d7dae2", light: "#ffffff" } }) : "";
  const qrBlock = url
    ? `<div class="qr">${svg}</div><div class="url">${esc(url)}</div>`
    : `<div class="warn">No public URL configured. Set <code>publicUrl</code> in <code>~/.config/pocketwire/pocketwire.json</code> (e.g. <code>http://myhost.tailnet.ts.net:8787</code>) and restart, then reload this page.</div>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pocketwire — pair your phone</title>
    <style>
      :root { color-scheme: dark; --bg:#0b0e14; --panel:#11161f; --panel-2:#161c28; --border:#1f2733; --text:#d7dae2; --muted:#8b949e; --accent:#5fd68a; --blue:#79b8ff; }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100vh; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; display:grid; place-items:center; padding:2rem 1rem; }
      .card { background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:2rem; max-width:560px; width:100%; text-align:center; }
      h1 { margin:0 0 .25rem; font-size:1.4rem; }
      p.sub { color:var(--muted); margin:0 0 1.2rem; font-size:.9rem; }
      .qr { background:#fff; border-radius:14px; padding:1rem; display:inline-block; line-height:0; }
      .qr svg { width:min(80vw, 320px); height:auto; display:block; }
      .url { margin:1rem 0; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.8rem; word-break:break-all; color:var(--blue); background:var(--panel-2); border:1px solid var(--border); border-radius:8px; padding:.6rem; }
      .warn { margin:1rem 0; font-size:.85rem; line-height:1.5; color:var(--muted); background:var(--panel-2); border:1px solid var(--border); border-radius:8px; padding:.8rem; }
      .warn code { color:var(--blue); }
      .token { display:flex; gap:.5rem; align-items:center; justify-content:center; margin:1rem 0 .5rem; }
      .token input { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.8rem; background:var(--panel-2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:.5rem; width:13rem; text-align:center; outline:none; }
      button { background:var(--accent); border:0; color:#06220f; font-weight:600; border-radius:8px; padding:.5rem .9rem; font-size:.85rem; cursor:pointer; }
      .steps { text-align:left; margin-top:1.2rem; }
      .steps ol { margin:.4rem 0 0; padding-left:1.2rem; color:var(--muted); font-size:.85rem; line-height:1.6; }
      .steps b { color:var(--text); }
      .faint { color:var(--muted); font-size:.78rem; margin-top:1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>pocketwire</h1>
      <p class="sub">Pair your phone</p>
      ${qrBlock}
      <div class="token">
        <input readonly value="${esc(token)}" id="tok" spellcheck="false" />
        <button id="copy">copy</button>
      </div>
      <div class="steps">
        <ol>
          <li>On your phone, open the camera and <b>scan the QR</b> — or install the Android APK: <b>mobile/android/app/build/outputs/apk/debug/app-debug.apk</b>.</li>
          <li>The browser app opens with this PC's token already entered. In the native app, open Settings and enter the relay URL shown above plus this token.</li>
          <li>For the browser as a home-screen app, tap <b>Add to Home Screen</b>.</li>
          <li>Your phone and this PC must be on the same <b>Tailscale tailnet</b> — no port forwarding needed. If you changed the port, set <code>publicUrl</code> in the config to match.</li>
        </ol>
      </div>
      <div class="faint">pocketwire ${VERSION} — open this page on your phone, or run it on this PC and scan the QR.</div>
    </div>
    <script>
      const b = document.getElementById("copy");
      b.addEventListener("click", async () => {
        const t = document.getElementById("tok");
        try { await navigator.clipboard.writeText(t.value); b.textContent = "copied"; setTimeout(() => (b.textContent = "copy"), 1200); } catch {}
      });
    </script>
  </body>
</html>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
