#!/usr/bin/env node
// Rewrites the DS guards' per-file baselines (lib/testing/ratchet.ts): every
// app test that keeps one, or the guards named. A key a baseline knows (a
// retired word, a rule) may only go down in each file; a new key takes in its
// uses once. It runs each guard's own count, so the two can't disagree.
//
// Usage, from the web tree: node scripts/ds/baselines.mjs [app/glossaryGuard.test.ts ...]
import { execFileSync, spawnSync } from "node:child_process"

const guards = process.argv.slice(2).length
  ? process.argv.slice(2)
  : execFileSync("git", ["grep", "-l", "--untracked", "@/lib/testing/ratchet", "--", "app/*.test.ts", "app/*.test.tsx"], { encoding: "utf8" }).trim().split("\n").filter(Boolean)

const run = spawnSync("./node_modules/.bin/vitest", ["run", ...guards, "-t", "writes the baseline"], {
  stdio: "inherit",
  env: { ...process.env, DS_BASELINE: "write" },
})
process.exit(run.status ?? 1)
