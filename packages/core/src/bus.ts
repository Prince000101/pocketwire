import { EventEmitter } from "node:events";
import type { AgentEvent } from "./types.js";

export class EventBus {
  private emitter = new EventEmitter();

  on(listener: (ev: AgentEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  emit(ev: AgentEvent): void {
    this.emitter.emit("event", ev);
  }
}
