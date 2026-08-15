import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { PocketwireConfig, Relay } from "@pocketwire/core";
import { listSkills, log, tokenMatches, VERSION } from "@pocketwire/core";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
};

export interface AppOptions {
  relay: Relay;
  cfg: PocketwireConfig;
  webDir?: string;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, any>) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function authorize(req: IncomingMessage, query: URLSearchParams, cfg: PocketwireConfig): boolean {
  const header = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const token = header ?? query.get("token") ?? undefined;
  return tokenMatches(token, cfg);
}

function streamSse(req: IncomingMessage, res: ServerResponse, url: URL, relay: Relay): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  const since = url.searchParams.get("since") ?? undefined;
  for (const ev of relay.history(since)) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }
  const off = relay.bus.on((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    off();
  });
}

async function serveStatic(res: ServerResponse, pathname: string, webDir: string): Promise<void> {
  const target = pathname === "/" ? "/index.html" : pathname;
  const file = resolve(webDir, "." + target);
  if (!(file === webDir || file.startsWith(webDir + "/"))) {
    json(res, 403, { error: "forbidden" });
    return;
  }
  if (!existsSync(file)) {
    json(res, 404, { error: "not found" });
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(body);
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  relay: Relay,
  cfg: PocketwireConfig,
): Promise<void> {
  if (!authorize(req, url.searchParams, cfg)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  const m = url.pathname.slice("/api/".length);

  if (req.method === "GET" && m === "status") {
    json(res, 200, {
      ok: true,
      version: VERSION,
      agents: relay.sourcesList(),
      sessions: relay.sessions(),
      skills: listSkills(cfg.skillsDirs).length,
      ntfy: Boolean(cfg.ntfy?.topic),
    });
    return;
  }

  if (req.method === "GET" && m === "events") {
    streamSse(req, res, url, relay);
    return;
  }

  if (req.method === "GET" && m === "history") {
    json(res, 200, { events: relay.history(url.searchParams.get("since") ?? undefined) });
    return;
  }

  if (req.method === "GET" && m === "skills") {
    json(res, 200, { skills: listSkills(cfg.skillsDirs) });
    return;
  }

  if (req.method === "GET" && m === "approvals") {
    json(res, 200, { approvals: relay.pendingApprovals() });
    return;
  }

  if (req.method === "POST" && m === "prompt") {
    const body = await readJson(req);
    const text = String(body.text ?? "").trim();
    if (!text) {
      json(res, 400, { error: "text is required" });
      return;
    }
    const ins = relay.enqueueInstruction(text, body.session);
    json(res, 200, { ok: true, id: ins.id });
    return;
  }

  if (req.method === "POST" && m === "command") {
    const body = await readJson(req);
    const command = String(body.command ?? "").trim();
    if (!command) {
      json(res, 400, { error: "command is required" });
      return;
    }
    const cmd = relay.enqueueCommand(command, body.args, body.session);
    json(res, 200, { ok: true, id: cmd.id });
    return;
  }

  if (req.method === "POST" && m === "approve") {
    const body = await readJson(req);
    const answer = String(body.answer ?? "allow");
    const resp = relay.respondApproval(String(body.requestId), answer);
    json(res, resp ? 200 : 404, resp ? { ok: true } : { error: "no pending approval" });
    return;
  }

  if (req.method === "POST" && m === "abort") {
    relay.emit({ kind: "control.abort", source: "relay" });
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && m === "screenshot") {
    relay.emit({ kind: "control.screenshot", source: "relay" });
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: "unknown endpoint" });
}

export async function startApp(opts: AppOptions): Promise<{ server: Server }> {
  const { relay, cfg, webDir } = opts;
  const wss = new WebSocketServer({ noServer: true });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    void (async () => {
      try {
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url, relay, cfg);
        } else if (webDir) {
          await serveStatic(res, url.pathname, webDir);
        } else {
          json(res, 404, { error: "not found" });
        }
      } catch (err) {
        log.error("request failed", err);
        if (!res.headersSent) json(res, 500, { error: "internal error" });
      }
    })();
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (!authorize(req, url.searchParams, cfg)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "history", events: relay.history() }));
    const off = relay.bus.on((ev) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "event", event: ev }));
    });
    ws.on("close", () => off());
    ws.on("error", () => undefined);
  });

  return { server };
}
