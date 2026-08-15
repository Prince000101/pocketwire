import { resolve } from "node:path";
import { ensureToken, loadConfig, log, Push, Relay, VERSION } from "@pocketwire/core";
import { OpenCodeAdapter } from "@pocketwire/opencode";
import { startApp } from "./app.js";

const cfg = loadConfig();
const token = ensureToken(cfg);
if (cfg.tokens.length === 0) cfg.tokens = [token];

const push = cfg.ntfy?.topic ? new Push(cfg.ntfy) : undefined;
const relay = new Relay({ dataDir: cfg.dataDir, push });
const webDir = resolve(import.meta.dirname, "../../web/public");

const { server } = await startApp({ relay, cfg, webDir });

if (cfg.opencode?.serverUrl) {
  new OpenCodeAdapter({
    relay,
    serverUrl: cfg.opencode.serverUrl,
    password: process.env.OPENCODE_SERVER_PASSWORD,
  }).start();
  log.info(`opencode adapter connecting to ${cfg.opencode.serverUrl}`);
}

server.listen(cfg.port, cfg.host, () => {
  log.info(`pocketwire ${VERSION} listening on http://${cfg.host}:${cfg.port}`);
  log.info(`phone access token: ${token}`);
  if (push) log.info(`ntfy push topic: ${cfg.ntfy!.topic}`);
  log.info("from phone (same Wi-Fi): http://<pc-ip>:" + cfg.port);
  log.info("remote via Tailscale: https://<your-tailscale-host>.ts.net or 'tailscale serve'");
});
