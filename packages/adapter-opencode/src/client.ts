import type { OcCommand, OcEvent, OcSession } from "./types.js";

export class OpenCodeClient {
  private auth: string | undefined;

  constructor(
    private readonly base: string,
    password?: string,
  ) {
    if (password) this.auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  }

  private url(path: string): string {
    return this.base.replace(/\/+$/, "") + path;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.auth) h["Authorization"] = this.auth;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method,
      headers: this.headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`opencode ${method} ${path} -> ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listSessions(): Promise<OcSession[]> {
    return this.request<OcSession[]>("GET", "/session");
  }

  async listCommands(): Promise<OcCommand[]> {
    return this.request<OcCommand[]>("GET", "/command");
  }

  async promptAsync(sessionID: string, text: string): Promise<void> {
    await this.request("POST", `/session/${encodeURIComponent(sessionID)}/prompt_async`, {
      parts: [{ type: "text", text }],
    });
  }

  async runCommand(sessionID: string, command: string, arguments_: string): Promise<void> {
    await this.request("POST", `/session/${encodeURIComponent(sessionID)}/command`, {
      command,
      arguments: arguments_,
    });
  }

  async abort(sessionID: string): Promise<void> {
    await this.request("POST", `/session/${encodeURIComponent(sessionID)}/abort`);
  }

  async respondPermission(sessionID: string, permissionID: string, response: string, remember?: boolean): Promise<void> {
    await this.request("POST", `/session/${encodeURIComponent(sessionID)}/permissions/${encodeURIComponent(permissionID)}`, {
      response,
      remember,
    });
  }

  async *events(signal?: AbortSignal): AsyncGenerator<OcEvent, void, void> {
    const res = await fetch(this.url("/event"), {
      headers: this.headers(false),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`opencode /event -> ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            yield JSON.parse(payload) as OcEvent;
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
