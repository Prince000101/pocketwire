export interface OcEvent {
  type: string;
  properties: any;
}

export interface OcSession {
  id: string;
  title: string;
  directory: string;
  time: { created: number; updated: number };
  summary?: { additions: number; deletions: number; files: number };
}

export interface OcCommand {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
}

export interface OcPermission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { created: number };
}

export interface OcTextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text?: string;
  delta?: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
}

export interface OcToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  tool: string;
  callID: string;
  status: "pending" | "running" | "completed" | "error";
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: { start: number; end?: number };
}

export interface OcStepPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step_start" | "step_finish" | "subtask";
  description?: string;
  agent?: string;
}

export interface OcReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text?: string;
  time?: { start: number; end?: number };
}

export interface OcPartUpdated {
  part: OcTextPart | OcToolPart | OcStepPart | OcReasoningPart | { type: string; sessionID?: string };
  delta?: string;
}
