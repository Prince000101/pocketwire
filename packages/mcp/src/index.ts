import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RelayClient } from "./relay-client.js";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function truncate(text: string, max = 4000): string {
  return text.length > max ? text.slice(0, max) + "\n…(truncated)" : text;
}

async function imageData(path: string): Promise<{ data: string; mime: string }> {
  const buf = await readFile(resolve(path));
  const mime = MIME[extname(path).toLowerCase()] ?? "image/png";
  return { data: buf.toString("base64"), mime };
}

const ok = { content: [{ type: "text" as const, text: "sent" }] };

export async function main(): Promise<void> {
  const relay = new RelayClient();
  const server = new McpServer({ name: "pocketwire", version: "0.1.0" });

  server.registerTool(
    "notify",
    {
      title: "notify",
      description: "Push a short, precise notification to your phone (ntfy + activity feed).",
      inputSchema: {
        title: z.string().optional(),
        message: z.string().describe("One-line summary; keep under ~200 chars"),
        priority: z.number().int().min(1).max(3).optional(),
      },
    },
    async ({ title, message, priority }) => {
      await relay.notify(title ?? "notification", truncate(message, 500), priority);
      return ok;
    },
  );

  server.registerTool(
    "send_output",
    {
      title: "send_output",
      description: "Send a detailed text result to the phone feed (full text, rendered as a message).",
      inputSchema: {
        text: z.string().describe("Full output text"),
        title: z.string().optional(),
      },
    },
    async ({ text, title }) => {
      await relay.sendOutput(text, title);
      return ok;
    },
  );

  server.registerTool(
    "send_screenshot",
    {
      title: "send_screenshot",
      description: "Send an image (screenshot, diagram, PNG/JPG) to the phone.",
      inputSchema: {
        image_path: z.string().describe("Path to the image file"),
        message: z.string().optional(),
      },
    },
    async ({ image_path, message }) => {
      const img = await imageData(image_path);
      await relay.sendScreenshot(img.data, img.mime, message);
      return ok;
    },
  );

  server.registerTool(
    "ask_user",
    {
      title: "ask_user",
      description: "Ask a multiple-choice question on the phone and block until the user answers. Timeout in seconds (default 60).",
      inputSchema: {
        question: z.string().describe("Question to show on the phone"),
        options: z.array(z.string()).optional(),
        timeout: z.number().int().min(1).max(600).optional(),
      },
    },
    async ({ question, options, timeout }) => {
      const answer = await relay.askUser(question, options ?? ["yes", "no"], (timeout ?? 60) * 1000);
      return { content: [{ type: "text" as const, text: answer }] };
    },
  );

  server.registerTool(
    "get_instruction",
    {
      title: "get_instruction",
      description: "Fetch a pending instruction typed on the phone. Returns an empty string when there is none.",
      inputSchema: {},
    },
    async () => {
      const instruction = await relay.nextInstruction();
      return { content: [{ type: "text" as const, text: instruction ?? "" }] };
    },
  );

  server.registerTool(
    "list_skills",
    {
      title: "list_skills",
      description: "List skill / slash-command names the phone can trigger.",
      inputSchema: {},
    },
    async () => {
      const skills = await relay.listSkills();
      return { content: [{ type: "text" as const, text: skills.join("\n") }] };
    },
  );

  server.registerTool(
    "report_done",
    {
      title: "report_done",
      description: "Notify the phone that the current task finished.",
      inputSchema: {
        message: z.string().describe("One-line completion summary"),
      },
    },
    async ({ message }) => {
      await relay.reportDone(truncate(message, 500));
      return ok;
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
