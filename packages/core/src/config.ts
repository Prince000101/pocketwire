import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface NtfyConfig {
  topic: string;
  server?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  kind: "opencode" | string;
  serverUrl?: string;
  password?: string;
}

export interface PocketwireConfig {
  host: string;
  port: number;
  tokens: string[];
  pin?: string;
  ntfy?: NtfyConfig;
  skillsDirs: string[];
  dataDir: string;
  allowCommands?: string[];
  agents?: AgentConfig[];
  opencode?: { serverUrl?: string };
  /** Public HTTPS URL the phone reaches the relay at, e.g. https://myhost.ts.net. Used for the QR code. */
  publicUrl?: string;
}

/** Resolves the configured agent list, treating legacy `opencode.serverUrl` as a single agent. */
export function resolveAgents(cfg: PocketwireConfig): AgentConfig[] {
  if (cfg.agents && cfg.agents.length > 0) return cfg.agents;
  if (cfg.opencode?.serverUrl) {
    return [{ id: "opencode", name: "opencode", kind: "opencode", serverUrl: cfg.opencode.serverUrl }];
  }
  return [{ id: "opencode", name: "opencode", kind: "opencode", serverUrl: "http://127.0.0.1:4096" }];
}

const HOME = homedir();

export const DEFAULT_DATA_DIR = resolve(HOME, ".pocketwire");

function defaultSkillsDirs(): string[] {
  return [
    resolve(HOME, ".agents", "skills"),
    resolve(HOME, ".config", "opencode", "skills"),
    resolve(HOME, ".config", "opencode", "command"),
  ];
}

const DEFAULTS: PocketwireConfig = {
  host: "127.0.0.1",
  port: 8787,
  tokens: [],
  skillsDirs: defaultSkillsDirs(),
  dataDir: DEFAULT_DATA_DIR,
};

export function configPath(): string {
  return process.env.POCKETWIRE_CONFIG ?? resolve(HOME, ".config", "pocketwire", "pocketwire.json");
}

export function loadConfig(path?: string): PocketwireConfig {
  const file = path ?? configPath();
  const base: PocketwireConfig = { ...DEFAULTS, skillsDirs: defaultSkillsDirs(), dataDir: DEFAULT_DATA_DIR };
  if (!existsSync(file)) return base;
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<PocketwireConfig>;
  return { ...base, ...raw, skillsDirs: raw.skillsDirs ?? base.skillsDirs };
}

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}
