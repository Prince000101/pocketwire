import type { NtfyConfig } from "./config.js";

export interface PushMessage {
  title?: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  image?: { data: string; mime: string };
}

export class Push {
  constructor(private readonly cfg: NtfyConfig) {}

  async send(msg: PushMessage): Promise<void> {
    const server = (this.cfg.server ?? "https://ntfy.sh").replace(/\/+$/, "");
    const url = `${server}/${encodeURIComponent(this.cfg.topic)}`;
    const headers: Record<string, string> = {};
    if (msg.title) headers["Title"] = msg.title;
    if (msg.priority) headers["Priority"] = String(msg.priority);
    if (msg.tags?.length) headers["Tags"] = msg.tags.join(",");

    let body: string | Uint8Array = msg.message;
    if (msg.image) {
      headers["Filename"] = "pocketwire.png";
      headers["Content-Type"] = msg.image.mime;
      const buf = Buffer.from(msg.image.data, "base64");
      body = new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
    } else {
      headers["Content-Type"] = "text/plain; charset=utf-8";
    }

    try {
      await fetch(url, { method: "POST", headers, body });
    } catch (err) {
      console.error("push failed", err);
    }
  }
}
