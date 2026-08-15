import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentEvent } from "./types.js";

export class EventStore {
  private events: AgentEvent[] = [];
  private readonly file: string;
  private dirty = false;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, private readonly max = 3000) {
    this.file = resolve(dataDir, "events.json");
    this.load();
  }

  private load(): void {
    try {
      this.events = JSON.parse(readFileSync(this.file, "utf8")) as AgentEvent[];
    } catch {
      this.events = [];
    }
  }

  append(ev: AgentEvent): void {
    this.events.push(ev);
    if (this.events.length > this.max) {
      this.events.splice(0, this.events.length - this.max);
    }
    this.dirty = true;
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, JSON.stringify(this.events));
      } catch {
        this.dirty = true;
      }
    }, 400);
  }

  all(): AgentEvent[] {
    return [...this.events];
  }

  since(afterId?: string): AgentEvent[] {
    if (!afterId) return this.all();
    const index = this.events.findIndex((e) => e.id === afterId);
    return index === -1 ? this.all() : this.events.slice(index + 1);
  }
}
