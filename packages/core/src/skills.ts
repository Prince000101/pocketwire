import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface SkillInfo {
  name: string;
  description?: string;
  path: string;
  source: "skill" | "command";
}

function firstLine(text: string): string | undefined {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  return line ?? undefined;
}

export function listSkills(dirs: string[]): SkillInfo[] {
  const out: SkillInfo[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const isCommandDir = dir.endsWith("command");
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      let isDir = false;
      let isFile = false;
      try {
        const st = statSync(p);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue;
      }
      if (isDir) {
        const skillFile = resolve(p, "SKILL.md");
        if (existsSync(skillFile)) {
          out.push({
            name: entry,
            description: firstLine(readFileSync(skillFile, "utf8")),
            path: p,
            source: "skill",
          });
        }
      } else if (isCommandDir && isFile && entry.endsWith(".md")) {
        out.push({
          name: entry.replace(/\.md$/, ""),
          description: firstLine(readFileSync(p, "utf8")),
          path: p,
          source: "command",
        });
      }
    }
  }
  return out;
}
