// The fluidity budgets' one checker: every *-budgets.json in this folder is
// read, checked and printed here, whichever scenario measured it (docs.mjs,
// content.mjs, routes.mjs, and each programme's own as it registers in
// scenarios.json). docs.mjs and content.mjs each had a copy of this loop.
//
// A budgets file:
//   { "about": [ ...lines... ],
//     "budgets": { "<metric>": {
//        "scenario": "<a scenario in scenarios.json>",
//        "owner": "<the package that gets it to target>",
//        "source": "<why this number: the programme's line, the measurement>",
//        "max": n, "target": n,                         // one value for every CPU
//        "cpu1": { "max": n, "target": n, "measured": n }, // or one per CPU slowdown
//        "cpu4": { ... },
//        "desktop4": { ... },                           // a device the scenario doesn't run at that slowdown
//        "enforce": false } } }                         // printed, never failing
// cpuN is the device the scenario runs at slowdown N: a computer at 1x and a
// phone above, unless its line in scenarios.json names one (--device). A
// surface the phone doesn't have (the timeline, a board drag, the list's
// keys) is run on a computer at 4x and held to desktop4, never to the phone's
// cpu4 (FLUIDITY-LEAD-2, 21 Oct 2026). A device's own level wins over cpuN.
// max is what a run must stay under now and only ever goes down; target is
// where the metric must get to. Never raise a max to make a run pass.
import { readFileSync } from "node:fs"

/**
 * @typedef {{ about?: string[], budgets?: Record<string, Record<string, any>> }} BudgetsFile
 * @typedef {{ metric: string, scenario: string | null, value: number | null, max: number, target: number | null, owner: string, ok: boolean | null, enforced: boolean }} CheckRow
 */

/**
 * The budgets file at `path`, parsed.
 * @param {string} path
 * @returns {BudgetsFile}
 */
export function readBudgets(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** A budget level's key: cpuN, or a device's own (desktopN, phoneN). */
export const LEVEL = /^(cpu|desktop|phone)\d+$/

/**
 * The max and target that apply at `cpu` on `device` (a budget per CPU, or
 * one for all). `ownDevice` is the device the scenario runs at that slowdown:
 * a run on another device reads only that device's own level.
 * @param {Record<string, any>} budget
 * @param {number} cpu
 * @param {string | null} [device]
 * @param {string | null} [ownDevice]
 * @returns {{ max: number, target: number | null } | undefined}
 */
export function limitsAt(budget, cpu, device = null, ownDevice = null) {
  const own = device ? budget[`${device}${cpu}`] : undefined
  const theScenarios = !device || !ownDevice || device === ownDevice
  const at = own ?? (theScenarios ? (budget[`cpu${cpu}`] ?? (budget.max !== undefined ? budget : undefined)) : undefined)
  if (!at || at.max === undefined) return undefined
  return { max: at.max, target: at.target ?? null }
}

/**
 * Each budget of `file` that applies at `cpu` (and, given `scenarios`, to one
 * of them) checked against `metrics`: a row per budget. A metric that wasn't
 * measured is null and counts as missed when enforced: a step that failed in
 * every run must never pass for a budget kept. With `skipMissing`, a metric
 * the run never set (undefined: its part wasn't asked for) has no row.
 * `device` is the device the run used and `ownDevice` the one its scenario
 * runs at `cpu` (limitsAt); without them every level reads as the scenario's.
 * @param {BudgetsFile} file
 * @param {Record<string, unknown>} metrics
 * @param {{ cpu?: number, scenarios?: string[] | null, skipMissing?: boolean, device?: string | null, ownDevice?: string | null }} [options]
 * @returns {CheckRow[]}
 */
export function check(file, metrics, { cpu = 1, scenarios = null, skipMissing = false, device = null, ownDevice = null } = {}) {
  const rows = []
  for (const [metric, budget] of Object.entries(file.budgets ?? {})) {
    if (scenarios && budget.scenario && !scenarios.includes(budget.scenario)) continue
    const limits = limitsAt(budget, cpu, device, ownDevice)
    if (!limits) continue
    const raw = metrics[metric]
    if (skipMissing && raw === undefined) continue
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null
    const ok = value === null ? null : value <= limits.max
    rows.push({ metric, scenario: budget.scenario ?? null, value, max: limits.max, target: limits.target, owner: budget.owner ?? "", ok, enforced: budget.enforce !== false })
  }
  return rows
}

/**
 * How many rows fail the run: enforced and over, or enforced and unmeasured.
 * @param {CheckRow[]} rows
 * @returns {number}
 */
export function missed(rows) {
  return rows.filter((r) => r.enforced && r.ok !== true).length
}

/**
 * A row's verdict in words.
 * @param {CheckRow} r
 * @returns {string}
 */
export function verdict(r) {
  if (r.ok === null) return r.enforced ? "NOT MEASURED" : "no value"
  if (r.ok) return r.target !== null && r.value > r.target ? "ok (over target)" : "ok"
  return r.enforced ? "MISSED" : "over (report only)"
}

/**
 * The rows as a table on the console.
 * @param {CheckRow[]} rows
 * @param {string} [title]
 */
export function printChecks(rows, title = "") {
  if (title) console.log(title)
  const w = Math.max(20, ...rows.map((r) => r.metric.length)) + 2
  console.log("budget".padEnd(w), "value".padStart(9), "max".padStart(9), "target".padStart(9), "  owner  verdict")
  for (const r of rows) {
    const v = r.value === null ? "-" : String(r.value)
    console.log(r.metric.padEnd(w), v.padStart(9), String(r.max).padStart(9), String(r.target ?? "").padStart(9), " ", (r.owner || "").padEnd(6), verdict(r))
  }
}

/**
 * What is wrong with a budgets file, in words; empty when it is sound. Held
 * by app/fluidityBudgets.test.ts for every file in this folder.
 * @param {BudgetsFile} file
 * @param {{ scenarios?: string[] }} [options]
 * @returns {string[]}
 */
export function problems(file, { scenarios } = {}) {
  const out = []
  if (!Array.isArray(file.about) || file.about.length === 0) out.push("no about lines")
  if (!file.budgets || typeof file.budgets !== "object") return [...out, "no budgets"]
  for (const [metric, b] of Object.entries(file.budgets)) {
    if (!b.owner) out.push(`${metric}: no owner`)
    if (!b.source) out.push(`${metric}: no source`)
    if (scenarios && b.scenario && !scenarios.includes(b.scenario)) out.push(`${metric}: scenario "${b.scenario}" isn't registered`)
    const levels = Object.keys(b).filter((k) => LEVEL.test(k))
    const all = levels.length ? levels.map((k) => [k, b[k]]) : [["", b]]
    if (!levels.length && b.max === undefined) out.push(`${metric}: no max`)
    for (const [k, at] of all) {
      const where = k ? `${metric}.${k}` : metric
      if (typeof at.max !== "number") out.push(`${where}: max isn't a number`)
      if (at.target !== undefined && typeof at.target !== "number") out.push(`${where}: target isn't a number`)
      if (typeof at.max === "number" && typeof at.target === "number" && at.max < at.target) out.push(`${where}: max ${at.max} is under its target ${at.target}; a met budget's max is its target`)
    }
  }
  return out
}
