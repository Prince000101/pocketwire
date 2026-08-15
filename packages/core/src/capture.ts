import { execFile } from "node:child_process";

export interface CapturedImage {
  data: string;
  mime: string;
}

function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout: 15000 }, (err, stdout) =>
      err ? reject(err) : resolve(typeof stdout === "string" ? Buffer.from(stdout) : stdout),
    );
  });
}

export async function captureScreen(): Promise<CapturedImage | undefined> {
  const attempts: Array<[string, string[]]> = [
    ["grim", ["-t", "png", "-"]],
    ["import", ["-window", "root", "png:-"]],
    ["scrot", ["-o", "-"]],
  ];
  for (const [bin, args] of attempts) {
    try {
      const buf = await run(bin, args);
      if (buf.length > 0) return { data: buf.toString("base64"), mime: "image/png" };
    } catch {
      /* try next capture tool */
    }
  }
  return undefined;
}
