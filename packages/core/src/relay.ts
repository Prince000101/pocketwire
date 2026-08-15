import { randomUUID } from "node:crypto";
import { EventBus } from "./bus.js";
import type { PushMessage } from "./push.js";
import { Push } from "./push.js";
import { EventStore } from "./store.js";
import type {
  AgentEvent,
  ApprovalRequest,
  ApprovalResponse,
  CommandRequest,
  EventSource,
  Instruction,
} from "./types.js";

export interface RelayOptions {
  dataDir: string;
  push?: Push;
}

export type EmitInput = Omit<AgentEvent, "id" | "ts">;

export class Relay {
  readonly bus = new EventBus();
  readonly store: EventStore;
  readonly push?: Push;

  private instructions: Instruction[] = [];
  private commands: CommandRequest[] = [];
  private approvals = new Map<string, ApprovalRequest>();
  private approvalWaiters = new Map<string, (r: ApprovalResponse) => void>();
  private sources = new Set<string>();

  constructor(opts: RelayOptions) {
    this.store = new EventStore(opts.dataDir);
    this.push = opts.push;
  }

  emit(input: EmitInput, notify?: PushMessage): AgentEvent {
    const ev: AgentEvent = { id: randomUUID(), ts: Date.now(), ...input };
    this.store.append(ev);
    this.bus.emit(ev);
    if (notify && this.push) void this.push.send(notify);
    return ev;
  }

  history(sinceId?: string): AgentEvent[] {
    return this.store.since(sinceId);
  }

  registerSource(name: string): void {
    this.sources.add(name);
  }

  sourcesList(): string[] {
    return [...this.sources];
  }

  sessions(): string[] {
    return [];
  }

  enqueueInstruction(text: string, session?: string): Instruction {
    const ins: Instruction = { id: randomUUID(), ts: Date.now(), text, source: "phone", session };
    this.instructions.push(ins);
    this.emit({
      kind: "instruction.received",
      source: "relay",
      session,
      title: "New instruction from phone",
      message: text,
    });
    return ins;
  }

  nextInstruction(): Instruction | undefined {
    return this.instructions.shift();
  }

  enqueueCommand(command: string, args?: string[], session?: string): CommandRequest {
    const cmd: CommandRequest = { id: randomUUID(), ts: Date.now(), command, args, session };
    this.commands.push(cmd);
    this.emit({
      kind: "command.request",
      source: "relay",
      session,
      title: "Command from phone",
      message: `/${command}${args?.length ? " " + args.join(" ") : ""}`,
    });
    return cmd;
  }

  nextCommand(): CommandRequest | undefined {
    return this.commands.shift();
  }

  askApproval(
    agent: string,
    question: string,
    options: string[],
    session?: string,
  ): Promise<ApprovalResponse> {
    const req: ApprovalRequest = { id: randomUUID(), ts: Date.now(), agent, question, options, session };
    this.approvals.set(req.id, req);
    this.emit(
      {
        kind: "approval.request",
        source: "relay",
        session,
        agent,
        title: "Approval needed",
        message: question,
        data: { requestId: req.id, options },
      },
      { title: "Approval needed", message: question, priority: 3, tags: ["warning"] },
    );
    return new Promise((resolve) => this.approvalWaiters.set(req.id, resolve));
  }

  respondApproval(requestId: string, answer: string): ApprovalResponse | undefined {
    const waiter = this.approvalWaiters.get(requestId);
    const req = this.approvals.get(requestId);
    if (!waiter || !req) return undefined;
    const resp: ApprovalResponse = { requestId, answer, ts: Date.now() };
    this.approvalWaiters.delete(requestId);
    this.approvals.delete(requestId);
    waiter(resp);
    this.emit({
      kind: "approval.response",
      source: "relay",
      session: req.session,
      agent: req.agent,
      title: "Approval response",
      message: `${req.question} -> ${answer}`,
      data: { requestId, answer },
    });
    return resp;
  }

  pendingApprovals(): ApprovalRequest[] {
    return [...this.approvals.values()];
  }

  agentEvent(kind: AgentEvent["kind"], source: EventSource, opts: Partial<AgentEvent> = {}): AgentEvent {
    return this.emit({ kind, source, ...opts });
  }
}
