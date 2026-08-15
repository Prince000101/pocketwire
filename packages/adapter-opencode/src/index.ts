import { captureScreen, type Relay } from "@pocketwire/core";
import { OpenCodeClient } from "./client.js";
import {
  approvalInput,
  handleReasoningPart,
  handleStepPart,
  handleToolPart,
  hasPart,
  isReasoning,
  isStep,
  isTool,
  PartTracker,
} from "./normalize.js";
import type { OcEvent, OcPermission, OcSession } from "./types.js";

export interface OpenCodeAdapterOptions {
  relay: Relay;
  serverUrl?: string;
  password?: string;
  pollMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class OpenCodeAdapter {
  private readonly relay: Relay;
  private readonly client: OpenCodeClient;
  private readonly pollMs: number;
  private readonly parts = new PartTracker();
  private stopped = false;
  private connected = false;
  private currentSession: string | undefined;
  private sessionList: OcSession[] = [];

  constructor(opts: OpenCodeAdapterOptions) {
    this.relay = opts.relay;
    this.client = new OpenCodeClient(opts.serverUrl ?? "http://127.0.0.1:4096", opts.password);
    this.pollMs = opts.pollMs ?? 500;
  }

  start(): void {
    this.relay.registerSource("opencode");
    this.relay.setSessionProvider(() => this.sessionList.map((s) => s.id));
    this.wireRelay();
    void this.run();
  }

  stop(): void {
    this.stopped = true;
  }

  private wireRelay(): void {
    setInterval(() => {
      this.parts.flush(this.relay);
      const ins = this.relay.nextInstruction();
      if (ins) void this.inject(ins.text, ins.session);
    }, this.pollMs);

    setInterval(() => {
      const cmd = this.relay.nextCommand();
      if (cmd) void this.invokeCommand(cmd.command, cmd.args?.join(" ") ?? "", cmd.session);
    }, this.pollMs);

    this.relay.bus.on((ev) => {
      if (ev.kind === "control.abort") {
        const id = this.currentSession;
        if (id) void this.client.abort(id);
      } else if (ev.kind === "control.screenshot") {
        void this.screenshot();
      }
    });
  }

  private async screenshot(): Promise<void> {
    const shot = await captureScreen();
    if (!shot) {
      this.relay.emit({ kind: "agent.error", source: "opencode", title: "Screenshot failed", message: "no capture tool (grim/import/scrot) available" });
      return;
    }
    this.relay.emit({
      kind: "screenshot.taken",
      source: "opencode",
      title: "Screenshot from screen",
      message: "captured screen",
      image: { data: shot.data, mime: shot.mime },
    });
  }

  private async inject(text: string, session?: string): Promise<void> {
    const id = await this.resolveSession(session);
    if (!id) {
      this.relay.emit({ kind: "agent.error", source: "opencode", title: "No active session", message: "cannot inject prompt: no opencode session" });
      return;
    }
    try {
      await this.client.promptAsync(id, text);
    } catch (e) {
      this.relay.emit({ kind: "agent.error", source: "opencode", title: "Prompt injection failed", message: errMsg(e) });
    }
  }

  private async invokeCommand(command: string, args: string, session?: string): Promise<void> {
    const id = await this.resolveSession(session);
    if (!id) {
      this.relay.emit({ kind: "agent.error", source: "opencode", title: "No active session", message: `cannot run /${command}: no opencode session` });
      return;
    }
    try {
      await this.client.runCommand(id, command, args);
    } catch (e) {
      this.relay.emit({ kind: "agent.error", source: "opencode", title: `Command /${command} failed`, message: errMsg(e) });
    }
  }

  private async resolveSession(preferred?: string): Promise<string | undefined> {
    if (preferred) return preferred;
    if (this.currentSession) return this.currentSession;
    if (this.sessionList.length > 0) {
      this.sessionList.sort((a, b) => b.time.updated - a.time.updated);
      this.currentSession = this.sessionList[0]?.id;
      return this.currentSession;
    }
    try {
      const sessions = await this.client.listSessions();
      sessions.sort((a, b) => b.time.updated - a.time.updated);
      this.sessionList = sessions;
      this.currentSession = sessions[0]?.id;
      return this.currentSession;
    } catch {
      return undefined;
    }
  }

  private async syncSessions(): Promise<void> {
    try {
      this.sessionList = await this.client.listSessions();
    } catch {
      /* keep stale list */
    }
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    this.relay.emit({ kind: "system.status", source: "relay", title: "opencode server", message: value ? "connected" : "disconnected" });
  }

  private async run(): Promise<void> {
    let delay = 2000;
    while (!this.stopped) {
      try {
        await this.syncSessions();
        this.setConnected(true);
        delay = 2000;
        await this.streamEvents();
      } catch {
        this.setConnected(false);
        await sleep(delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  }

  private async streamEvents(): Promise<void> {
    for await (const event of this.client.events()) {
      if (this.stopped) return;
      this.handleEvent(event);
    }
  }

  private handleEvent(event: OcEvent): void {
    const p = event.properties;
    switch (event.type) {
      case "session.created":
      case "session.updated":
        this.currentSession = p.id;
        void this.syncSessions();
        break;
      case "session.status":
        if (p.sessionID) this.currentSession = p.sessionID;
        break;
      case "session.idle":
        this.relay.emit(
          { kind: "agent.idle", source: "opencode", session: p.sessionID, title: "Agent idle", message: "waiting for instructions" },
          { title: "Agent idle", message: "opencode is waiting", priority: 2 },
        );
        break;
      case "session.error":
        this.relay.emit(
          { kind: "agent.error", source: "opencode", session: p.sessionID, title: "Session error", message: (p.message ?? p.error ?? "").slice(0, 300) },
          { title: "Session error", message: (p.message ?? p.error ?? "").slice(0, 300), priority: 3, tags: ["error"] },
        );
        break;
      case "message.updated":
        if (p.info?.error) {
          this.relay.emit({ kind: "agent.error", source: "opencode", session: p.info.sessionID, title: "Message error", message: errMsg(p.info.error) });
        }
        break;
      case "message.part.updated":
        this.handlePart(p);
        break;
      case "permission.updated":
        void this.handlePermission(p as OcPermission);
        break;
      case "session.diff":
      case "todo.updated":
        void this.emitInfo(event);
        break;
      case "command.executed":
        void this.syncSessions();
        break;
      default:
        break;
    }
  }

  private async handlePermission(permission: OcPermission): Promise<void> {
    const options = ["allow", "allow & remember", "deny"];
    try {
      const resp = await this.relay.askApproval("opencode", permission.title, options, permission.sessionID);
      const answer = resp.answer.toLowerCase();
      const response = answer.startsWith("deny") ? "deny" : "allow";
      const remember = answer.includes("remember");
      await this.client.respondPermission(permission.sessionID, permission.id, response, remember);
    } catch (e) {
      this.relay.emit({
        kind: "agent.error",
        source: "opencode",
        session: permission.sessionID,
        title: "Permission response failed",
        message: errMsg(e),
      });
    }
  }

  private emitInfo(event: OcEvent): void {
    const inputs = approvalInput(event);
    if (inputs) for (const input of inputs) this.relay.emit(input);
  }

  private handlePart(p: { part: any; delta?: string }): void {
    if (!p?.part) return;
    if (hasPart(p)) this.parts.push(this.relay, p.part, p.delta);
    else if (isTool(p)) handleToolPart(this.relay, p.part);
    else if (isStep(p)) handleStepPart(this.relay, p.part);
    else if (isReasoning(p)) handleReasoningPart(this.relay, p.part);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
