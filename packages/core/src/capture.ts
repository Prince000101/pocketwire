import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";

export interface CapturedImage {
  data: string;
  mime: string;
}

function run(bin: string, args: string[], maxBuffer = 64 * 1024 * 1024, timeout = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer, timeout, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${bin}: ${(stderr || "").slice(0, 300)}`));
      else resolve(stdout);
    });
  });
}

async function captureLinux(): Promise<CapturedImage | undefined> {
  const attempts: Array<[string, string[]]> = [
    ["grim", ["-t", "png", "-"]],
    ["import", ["-window", "root", "png:-"]],
    ["scrot", ["-o", "-"]],
  ];
  for (const [bin, args] of attempts) {
    try {
      const out = await run(bin, args);
      const buf = Buffer.from(out, "binary");
      if (buf.length > 0) return { data: buf.toString("base64"), mime: "image/png" };
    } catch {
      /* try next capture tool */
    }
  }
  return undefined;
}

async function captureMac(): Promise<CapturedImage | undefined> {
  const dir = mkdtempSync(join(tmpdir(), "pw-shot-"));
  const file = join(dir, "shot.png");
  try {
    await run("screencapture", ["-x", "-t", "png", file]);
    const buf = readFileSync(file);
    if (buf.length > 0) return { data: buf.toString("base64"), mime: "image/png" };
  } catch {
    /* no screen access */
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return undefined;
}

async function captureWindows(): Promise<CapturedImage | undefined> {
  const script =
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;" +
    "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;" +
    "$bmp=New-Object Drawing.Bitmap $b.Width,$b.Height;" +
    "$g=[Drawing.Graphics]::FromImage($bmp);" +
    "$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size);" +
    "$ms=New-Object IO.MemoryStream;" +
    "$bmp.Save($ms,[Drawing.Imaging.ImageFormat]::Png);" +
    "[Console]::OutputEncoding=[Text.Encoding]::ASCII;" +
    "[Convert]::ToBase64String($ms.ToArray())";
  for (const shell of ["powershell.exe", "pwsh.exe"]) {
    try {
      const out = (await run(shell, ["-NoProfile", "-NonInteractive", "-Command", script], 64 * 1024 * 1024, 20000)).trim();
      if (out.length > 0) return { data: out, mime: "image/png" };
    } catch {
      /* try next shell */
    }
  }
  return undefined;
}

export async function captureScreen(): Promise<CapturedImage | undefined> {
  switch (platform()) {
    case "darwin":
      return captureMac();
    case "win32":
      return captureWindows();
    default:
      return captureLinux();
  }
}
