export type EventKind =
  | "agent.started"
  | "agent.step"
  | "agent.output"
  | "agent.tool"
  | "agent.error"
  | "agent.done"
  | "agent.idle"
  | "approval.request"
  | "approval.response"
  | "instruction.received"
  | "command.request"
  | "control.abort"
  | "control.screenshot"
  | "session.started"
  | "session.ended"
  | "screenshot.taken"
  | "system.status";

export type EventSource = "opencode" | "mcp" | "relay" | "wrapper" | (string & {});

export interface AgentEventImage {
  data: string;
  mime: string;
  caption?: string;
}

export interface AgentEvent {
  id: string;
  ts: number;
  kind: EventKind;
  source: EventSource;
  session?: string;
  agent?: string;
  title?: string;
  message?: string;
  detail?: string;
  data?: Record<string, unknown>;
  image?: AgentEventImage;
}

export interface Instruction {
  id: string;
  ts: number;
  text: string;
  source: "phone" | "telegram";
  session?: string;
  agent?: string;
}

export interface CommandRequest {
  id: string;
  ts: number;
  command: string;
  args?: string[];
  session?: string;
  agent?: string;
}

export interface ApprovalRequest {
  id: string;
  ts: number;
  agent: string;
  question: string;
  options: string[];
  session?: string;
}

export interface ApprovalResponse {
  requestId: string;
  answer: string;
  ts: number;
}
