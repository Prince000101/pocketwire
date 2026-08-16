import { resolve } from "node:path";
import { ensureToken, loadConfig, log, Push, Relay, resolveAgents, resolveListenHost, resolvePublicUrl, VERSION } from "@pocketwire/core";
import { OpenCodeAdapter } from "@pocketwire/opencode";
import { startApp } from "./app.js";
import { pairUrl, terminalQr } from "./pair.js";

const cfg = loadConfig();
const token = ensureToken(cfg);
if (cfg.tokens.length === 0) cfg.tokens = [token];

const push = cfg.ntfy?.topic ? new Push(cfg.ntfy) : undefined;
const relay = new Relay({ dataDir: cfg.dataDir, push });
const webDir = resolve(import.meta.dirname, "../../web/public");
const publicUrl = await resolvePublicUrl(cfg);
const host = resolveListenHost(cfg);

const agents = resolveAgents(cfg);
for (const agent of agents) {
  new OpenCodeAdapter({
    relay,
    agent: agent.id,
    serverUrl: agent.serverUrl,
    password: agent.password ?? process.env.OPENCODE_SERVER_PASSWORD,
  }).start();
  log.info(`adapter [${agent.id}] (${agent.name}) connecting to ${agent.serverUrl}`);
}

const { server } = await startApp({ relay, cfg, webDir, publicUrl, agents });

server.listen(cfg.port, host, () => {
  const url = pairUrl(token, publicUrl);
  log.info(`pocketwire ${VERSION} listening on http://${host}:${cfg.port}`);
  log.info(`pair page (this PC): http://127.0.0.1:${cfg.port}/pair`);
  if (url) {
    log.info(`scan from phone: ${url}`);
    terminalQr(url)
      .then((qr) => console.log(qr))
      .catch(() => undefined);
  } else {
    log.info("no public URL found — set publicUrl in the config (e.g. http://myhost.ts.net:8787) to get a phone QR");
  }
  if (push) log.info(`ntfy push topic: ${cfg.ntfy!.topic}`);
  if (host !== "127.0.0.1") {
    log.info(`reachable from your tailnet on http://${host}:${cfg.port} — phone and PC must share a tailnet`);
  }
});
