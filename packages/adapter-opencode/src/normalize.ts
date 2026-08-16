import type { Relay, EmitInput } from "@pocketwire/core";
import type { OcEvent, OcPartUpdated, OcReasoningPart, OcStepPart, OcTextPart, OcToolPart } from "./types.js";

function summarize(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0);
  return (line ?? "").trim().slice(0, 160);
}

const QUIET_MS = 2000;

interface PendingPart {
  text: string;
  lastEmitLen: number;
  lastEmitTs: number;
  lastPushTs: number;
  session: string;
}

export class PartTracker {
  private parts = new Map<string, PendingPart>();

  push(relay: Relay, part: OcTextPart, delta?: string, agent = "opencode"): void {
    const cur = this.parts.get(part.id);
    const text = (cur?.text ?? "") + (delta ?? (part.text ?? ""));
    const ended = part.time?.end != null || part.ignored === true || delta === undefined;
    const now = Date.now();
    const timeElapsed = now - (cur?.lastEmitTs ?? 0) > 1200;
    const growth = text.length - (cur?.lastEmitLen ?? 0) > 1500;
    if (ended || (timeElapsed && growth)) {
      if (ended) {
        this.parts.delete(part.id);
      } else {
        this.parts.set(part.id, { text, lastEmitLen: text.length, lastEmitTs: now, lastPushTs: now, session: part.sessionID });
      }
      relay.emit({ kind: "agent.output", source: agent, agent, session: part.sessionID, message: summarize(text), detail: text });
    } else {
      this.parts.set(part.id, { text, lastEmitLen: cur?.lastEmitLen ?? 0, lastEmitTs: cur?.lastEmitTs ?? 0, lastPushTs: now, session: part.sessionID });
    }
  }

  /** Emit any pending part that has gone quiet (no updates for a while) — catches
   *  short replies whose final part update never carried an end time. */
  flush(relay: Relay, agent = "opencode"): void {
    const now = Date.now();
    for (const [id, cur] of this.parts) {
      if (now - cur.lastPushTs > QUIET_MS) {
        this.parts.delete(id);
        relay.emit({ kind: "agent.output", source: agent, agent, session: cur.session, message: summarize(cur.text), detail: cur.text });
      }
    }
  }
}

export function handleToolPart(relay: Relay, part: OcToolPart, agent = "opencode"): void {
  if (part.status === "error") {
    relay.emit({
      kind: "agent.error",
      source: agent,
      agent,
      session: part.sessionID,
      title: `${part.tool} failed`,
      message: (part.error ?? "").slice(0, 300),
      detail: part.error ?? "",
    });
    return;
  }
  if (part.status === "completed") {
    relay.emit({
      kind: "agent.tool",
      source: agent,
      agent,
      session: part.sessionID,
      title: part.title ?? part.tool,
      message: `ran ${part.tool}`,
      data: { tool: part.tool, output: (part.output ?? "").slice(0, 500) },
      detail: part.output ?? "",
    });
    return;
  }
  if (part.status === "running") {
    relay.emit({
      kind: "agent.step",
      source: agent,
      agent,
      session: part.sessionID,
      title: part.title ?? part.tool,
      message: `running ${part.tool}`,
    });
  }
}

export function handleStepPart(relay: Relay, part: OcStepPart, agent = "opencode"): void {
  const text = part.description ?? part.agent ?? part.type;
  relay.emit({ kind: "agent.step", source: agent, agent, session: part.sessionID, message: text });
}

export function handleReasoningPart(relay: Relay, part: OcReasoningPart, agent = "opencode"): void {
  const text = (part.text ?? "").slice(0, 200);
  if (text) relay.emit({ kind: "agent.step", source: agent, agent, session: part.sessionID, message: `thinking: ${text}` });
}

export function approvalInput(event: OcEvent, agent = "opencode"): EmitInput[] | undefined {
  switch (event.type) {
    case "session.status":
      return [{ kind: "agent.step", source: agent, agent, session: event.properties.sessionID, message: `session ${event.properties.status?.type ?? ""}` }];
    case "session.diff":
      return [
        {
          kind: "agent.step",
          source: agent,
          agent,
          session: event.properties.sessionID,
          message: `diff: ${event.properties.files ?? 0} files, +${event.properties.additions ?? 0} -${event.properties.deletions ?? 0}`,
        },
      ];
    case "todo.updated":
      return [{ kind: "agent.step", source: agent, agent, session: event.properties.sessionID, message: `todos updated (${event.properties.todos?.length ?? 0})` }];
    default:
      return undefined;
  }
}

export function hasPart(ev: OcPartUpdated): ev is OcPartUpdated & { part: OcTextPart } {
  return (ev.part as any).type === "text";
}
export function isTool(ev: OcPartUpdated): ev is OcPartUpdated & { part: OcToolPart } {
  return (ev.part as any).type === "tool";
}
export function isStep(ev: OcPartUpdated): ev is OcPartUpdated & { part: OcStepPart } {
  const t = (ev.part as any).type;
  return t === "step_start" || t === "step_finish" || t === "subtask";
}
export function isReasoning(ev: OcPartUpdated): ev is OcPartUpdated & { part: OcReasoningPart } {
  return (ev.part as any).type === "reasoning";
}
