import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PocketwireConfig } from "./config.js";

export function tokenMatches(provided: string | undefined, cfg: PocketwireConfig): boolean {
  if (!provided || cfg.tokens.length === 0) return false;
  return cfg.tokens.includes(provided);
}

export function ensureToken(cfg: PocketwireConfig): string {
  if (cfg.tokens.length > 0) return cfg.tokens[0] as string;
  const file = resolve(cfg.dataDir, ".token");
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) return existing;
  }
  const token = randomBytes(24).toString("hex");
  mkdirSync(cfg.dataDir, { recursive: true });
  writeFileSync(file, token, { mode: 0o600 });
  return token;
}
