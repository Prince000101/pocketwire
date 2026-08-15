#!/usr/bin/env node
// pocketwire setup (cross-platform): install deps, create config + token, optionally install systemd service.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = homedir();
const CFG_DIR = process.env.POCKETWIRE_CFG_DIR ?? join(HOME, ".config", "pocketwire");
const CFG_FILE = join(CFG_DIR, "pocketwire.json");
const DATA_DIR = process.env.POCKETWIRE_DATA_DIR ?? join(HOME, ".pocketwire");

function log(msg) {
  console.log(msg);
}
function logErr(msg) {
  console.error(msg);
}

async function ask(question, def) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve_) => {
    rl.question(`${question}${def ? ` [${def}]` : ""} `, (answer) => {
      rl.close();
      resolve_(answer.trim() === "" ? def : answer.trim());
    });
  });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: REPO_DIR, stdio: "inherit", env: process.env, ...opts });
  if (r.status !== 0) {
    logErr(`ERROR: ${cmd} ${args.join(" ")} exited with ${r.status ?? r.error?.message ?? "unknown"}`);
    process.exit(1);
  }
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  logErr(`ERROR: node.js >= 22 required, found ${process.version}`);
  process.exit(1);
}

log(`pocketwire setup (repo: ${REPO_DIR})`);

log("[1/4] installing dependencies...");
run("npm", ["install", "--no-audit", "--no-fund"]);

log(`[2/4] creating config at ${CFG_FILE}...`);
mkdirSync(CFG_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });
if (existsSync(CFG_FILE)) {
  log(`  existing config found, leaving it untouched:\n  ${CFG_FILE}`);
} else {
  const ntfy = await ask("ntfy topic for push alerts? (blank to skip)", "");
  const parts = [`  "host": "127.0.0.1"`, `  "port": 8787`, `  "tokens": []`];
  const skillsDirs = [
    join(HOME, ".agents", "skills"),
    join(HOME, ".config", "opencode", "skills"),
    join(HOME, ".config", "opencode", "command"),
  ];
  const skillsJson = skillsDirs.map((d) => `    ${JSON.stringify(d)}`).join(",\n");
  parts.push(`  "skillsDirs": [\n${skillsJson}\n  ]`);
  parts.push(`  "dataDir": ${JSON.stringify(DATA_DIR)}`);
  if (ntfy) parts.push(`  "ntfy": { "topic": ${JSON.stringify(ntfy)} }`);
  parts.push(`  "opencode": { "serverUrl": "http://127.0.0.1:4096" }`);
  const cfg = `{\n${parts.join(",\n")}\n}\n`;
  writeFileSync(CFG_FILE, cfg);
  log(`  wrote ${CFG_FILE} (phone token generated on first start)`);
}

log("[3/4] verifying the relay starts...");
const node = process.execPath;
const tsx = join(REPO_DIR, "node_modules", "tsx", "dist", "cli.mjs");
const cli = join(REPO_DIR, "packages", "server", "src", "cli.ts");
const child = spawnSync(node, [tsx, cli], {
  cwd: REPO_DIR,
  stdio: "ignore",
  env: { ...process.env, POCKETWIRE_CONFIG: CFG_FILE },
  timeout: 8000,
});
if (child.status === null) {
  log("  relay started and stayed up (killed after verification)");
} else if (child.error) {
  logErr(`  WARNING: relay could not start (${child.error.message}); check config`);
} else {
  logErr(`  WARNING: relay exited with code ${child.status}`);
}

if (platform() === "linux") {
  const svc = await ask("install as a systemd user service (autostart on login)? [y/N]", "N");
  if (/^[Yy]/.test(svc)) {
    const systemdDir = join(HOME, ".config", "systemd", "user");
    mkdirSync(systemdDir, { recursive: true });
    const template = join(REPO_DIR, "scripts", "pocketwire.service");
    if (existsSync(template)) {
      const content = readFileSync(template, "utf8")
        .replaceAll("__REPO__", REPO_DIR)
        .replaceAll("__NODE__", node)
        .replaceAll("__TSX__", tsx);
      writeFileSync(join(systemdDir, "pocketwire.service"), content);
      run("systemctl", ["--user", "daemon-reload"]);
      run("systemctl", ["--user", "enable", "--now", "pocketwire.service"]);
      log("  enabled: systemctl --user status pocketwire.service");
    }
  } else {
    log("  skip. run manually: npm start");
  }
}

  log(`
done. Next steps:
  1. Start opencode headless:   opencode serve --port 4096
  2. Start relay:               npm start
  3. Read the phone token from the relay log, enter it in the PWA.
  4. Expose remotely over Tailscale (see README Quick start).`);
