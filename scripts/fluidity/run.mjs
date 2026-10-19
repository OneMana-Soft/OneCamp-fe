#!/usr/bin/env node
// Every fluidity budget, one run, one table (Fluidity budgets #6; PLATFORM-LEAD,
// 17 Oct 2026). It runs the scenarios registered in scenarios.json beside this
// file, each against its own budgets file, and exits 1 when any enforced
// budget is missed or a scenario gave no answer.
//
//   pnpm next build && pnpm next start -p 3171
//   node scripts/fluidity/run.mjs --base http://localhost:3171 --out /tmp/flu
//   options: --only routes,docs   just these scenarios
//            --needs build,fixtures  just scenarios that need no more than these
//                                  (build: none needs a server; demo reads the live demo)
//            --cpu 1,4  --runs 3  (each scenario runs at its own CPU slowdowns, these only)
//   writes:  <out>/<scenario>-cpu<n>.json (each scenario's rows), <out>/summary.json
//            and <out>/summary.md (the table, to paste into a hand-back)
//
// Where it runs:
//   - the integrator's full gate, after its build: the gate scenarios only
//     (routes.mjs --check: deterministic, seconds);
//   - nightly and before a release, on a quieter machine: everything, at 4x,
//     as medians of 5 (`--cpu 4 --runs 5`). Under Docker's network churn, in
//     its own namespace: ~/bin/browser-isolated --forward 3171 -- node ...
//
// REGISTERING A SCENARIO (a programme's own, beside this file):
//   1. A script taking --base <url> --cpu <n> --runs <n> --budgets <file>
//      --result <file>. It measures, checks its budgets with budgets.mjs's
//      check(), writes { "checks": [rows] } to --result and exits 1 on a miss.
//   2. A budgets file, <area>-budgets.json, in budgets.mjs's format: each
//      budget's owner, source, max and target (one, or one per cpuN), and
//      its scenario, which the script must cover.
//   3. A line in scenarios.json: script, args, budgets, covers, needs
//      (build | fixtures | demo) and cpu.
//   app/fluidityBudgets.test.ts holds every budgets file and registration to
//   this on each quick check, so a broken one fails before it reaches a run.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { verdict } from "./budgets.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const list = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : null)

const NEEDS = ["build", "fixtures", "demo"]
const registry = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8")).scenarios
const only = list(opt("only", null))
const needs = list(opt("needs", null)) ?? NEEDS
const cpus = list(opt("cpu", null))?.map(Number) ?? null
const runs = opt("runs", "3")
const base = opt("base", "http://localhost:3171")
const out = opt("out", join(process.cwd(), ".fluidity"))
mkdirSync(out, { recursive: true })

const rows = []
const failures = []
for (const [name, s] of Object.entries(registry)) {
  if (only && !only.includes(name)) continue
  if (!needs.includes(s.needs)) continue
  for (const cpu of s.cpu ?? [1]) {
    if (cpus && s.needs !== "build" && !cpus.includes(cpu)) continue
    const result = join(out, `${name}-cpu${cpu}.json`)
    const argv = [join(here, s.script), ...(s.args ?? []), "--base", base, "--cpu", String(cpu), "--runs", runs, "--budgets", join(here, s.budgets), "--result", result]
    console.log(`\n== ${name} at ${cpu}× (${s.script} ${(s.args ?? []).join(" ")})`)
    const run = spawnSync(process.execPath, argv, { stdio: "inherit" })
    if (!existsSync(result)) {
      failures.push(`${name} at ${cpu}×: no answer (exit ${run.status}${run.signal ? `, ${run.signal}` : ""})`)
      continue
    }
    for (const r of JSON.parse(readFileSync(result, "utf8")).checks ?? []) rows.push({ ...r, scenario: r.scenario ?? name, cpu })
  }
}

const missedRows = rows.filter((r) => r.enforced && r.ok !== true)
const md = [
  `| scenario | cpu | budget | value | max | target | owner | verdict |`,
  `|---|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.scenario} | ${r.cpu}× | ${r.metric} | ${r.value ?? "-"} | ${r.max ?? "-"} | ${r.target ?? ""} | ${r.owner ?? ""} | ${verdict(r)} |`),
].join("\n")
writeFileSync(join(out, "summary.json"), JSON.stringify({ base, needs, rows, failures }, null, 2))
writeFileSync(join(out, "summary.md"), md + "\n")
console.log(`\n${md}\n`)
for (const f of failures) console.log(f)
console.log(`${rows.length} budgets, ${missedRows.length} missed${failures.length ? `, ${failures.length} scenario(s) with no answer` : ""}; table in ${join(out, "summary.md")}`)
process.exit(missedRows.length || failures.length ? 1 : 0)
