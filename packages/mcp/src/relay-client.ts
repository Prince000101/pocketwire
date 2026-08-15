import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@pocketwire/core";

export class RelayClient {
  readonly base: string;
  private readonly token: string;

  constructor() {
    const cfg = loadConfig();
    this.base = `http://${cfg.host}:${cfg.port}`;
    this.token = cfg.tokens[0] ?? this.readToken(cfg.dataDir);
  }

  private readToken(dataDir: string): string {
    const file = resolve(dataDir, ".token");
    if (existsSync(file)) {
      const t = readFileSync(file, "utf8").trim();
      if (t) return t;
    }
    throw new Error(`no pocketwire token found in ${file} — start the relay first`);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  private async post(path: string, body: unknown, timeoutMs: number): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.base + path, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal: ctrl.signal });
      const text = await res.text();
      let parsed: any = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        /* non-json response */
      }
      if (!res.ok) throw new Error(`relay ${path} -> ${res.status}: ${parsed.error ?? text}`);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(this.base + path, { headers: { Authorization: `Bearer ${this.token}` } });
    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* non-json response */
    }
    if (!res.ok) throw new Error(`relay ${path} -> ${res.status}: ${parsed.error ?? text}`);
    return parsed;
  }

  async notify(title: string, message: string, priority?: number, tags?: string[]): Promise<void> {
    await this.post("/api/notify", { title, message, priority, tags, source: "mcp" }, 10_000);
  }

  async sendOutput(text: string, title?: string): Promise<void> {
    await this.post("/api/output", { text, title, source: "mcp" }, 10_000);
  }

  async sendScreenshot(data: string, mime: string, message?: string): Promise<void> {
    await this.post("/api/screenshot-from-agent", { data, mime, message, source: "mcp" }, 20_000);
  }

  async askUser(question: string, options: string[], timeoutMs: number): Promise<string> {
    const resp = await this.post("/api/ask", { question, options, agent: "mcp" }, timeoutMs);
    return String(resp.answer ?? "");
  }

  async nextInstruction(): Promise<string | null> {
    const resp = await this.get("/api/instruction/next");
    return resp.instruction ?? null;
  }

  async listSkills(): Promise<string[]> {
    const resp = await this.get("/api/skills");
    return Array.isArray(resp.skills) ? resp.skills.map((s: any) => String(s.name ?? "")) : [];
  }

  async reportDone(message: string): Promise<void> {
    await this.post("/api/done", { message, source: "mcp" }, 10_000);
  }
}
