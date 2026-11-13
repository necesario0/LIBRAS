#!/usr/bin/env node
// Points git at the repo's hooks in .githooks (run by `npm install` through `prepare`).
// Builds that install packages outside a git checkout, such as a Render deploy, skip it.
import { spawnSync } from "node:child_process";

const inRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (inRepo.status === 0 && inRepo.stdout.trim() === "true") {
  spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
}
