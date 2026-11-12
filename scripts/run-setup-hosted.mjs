// Launches scripts/setup-hosted.sh with a bash that has this machine's tools.
// On Windows a bare `bash` resolves to WSL (System32/bash.exe), a separate
// Linux without Node, so look for Git Bash first.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function findBash() {
  if (process.platform !== "win32") return "bash";
  const gitRoots = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Git"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Git"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Git"),
  ];
  // Git installed somewhere else: git.exe lives in <root>/cmd.
  const where = spawnSync("where.exe", ["git"], { encoding: "utf8" });
  if (where.status === 0) {
    for (const line of where.stdout.split(/\r?\n/)) {
      if (line.trim()) gitRoots.push(dirname(dirname(line.trim())));
    }
  }
  for (const root of gitRoots) {
    if (!root) continue;
    const candidate = join(root, "bin", "bash.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const bash = findBash();
if (!bash) {
  console.error("Git Bash was not found. Install Git for Windows, then run: npm run setup:hosted");
  process.exit(1);
}
const result = spawnSync(bash, ["scripts/setup-hosted.sh"], { stdio: "inherit" });
process.exit(result.status ?? 1);
