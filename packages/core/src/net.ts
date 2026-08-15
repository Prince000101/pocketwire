import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import type { PocketwireConfig } from "./config.js";

/** Best-effort: resolve the public URL the phone should connect to.
 *  1. explicit config.publicUrl
 *  2. tailscale status --json -> Self.DNSName -> http://<host>.ts.net:<port>
 *  3. undefined (relay logs a hint to set publicUrl) */
export async function resolvePublicUrl(cfg: PocketwireConfig): Promise<string | undefined> {
  if (cfg.publicUrl?.trim()) return cfg.publicUrl.trim().replace(/\/+$/, "");
  const ts = await tailscaleHost();
  return ts ? `http://${ts}:${cfg.port}` : undefined;
}

/** Host the relay binds to. An explicit non-loopback `host` in the config wins;
 *  otherwise a Tailscale IPv4 (100.x) interface is preferred so the phone can
 *  reach it over the tailnet only; fallback is loopback. */
export function resolveListenHost(cfg: PocketwireConfig): string {
  if (cfg.host && cfg.host !== "127.0.0.1") return cfg.host;
  return tailscaleIP() ?? "127.0.0.1";
}

function tailscaleIP(): string | undefined {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const ni of ifaces ?? []) {
      if (ni.family === "IPv4" && !ni.internal && ni.address.startsWith("100.")) return ni.address;
    }
  }
  return undefined;
}

function tailscaleHost(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "tailscale",
      ["status", "--json"],
      { timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve(undefined);
        try {
          const json = JSON.parse(stdout) as { Self?: { DNSName?: string } };
          const dns = json.Self?.DNSName?.trim().replace(/\.$/, "");
          resolve(dns || undefined);
        } catch {
          resolve(undefined);
        }
      },
    );
  });
}
