#!/usr/bin/env node
// Before and after, side by side: medians across any number of measure.mjs
// runs of each, as a markdown table.
//
//   node scripts/fluidity/compare.mjs --before a.json b.json --after c.json d.json [--out table.md]
//
// surfaces.mjs results (--out files) are read too: every metric's median over
// the runs that weren't busy (load over BUSY_LOAD, or E-cores), or over every
// run when none was quiet, which the table then says. With --before alone it
// prints one build's medians across its files (FLUIDITY-LEAD-2, 21 Oct 2026).
//
// Run the two builds alternately (before, after, before, after...) rather
// than one after the other: a busy machine slows whichever runs during the
// busy minutes, and alternating shares that out.
import { readFileSync, writeFileSync } from "node:fs"
import { BUSY_LOAD, median } from "./lib.mjs"

const args = process.argv.slice(2)
const list = (flag) => {
  const i = args.indexOf(flag)
  if (i < 0) return []
  const out = []
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j])
  return out
}
const before = list("--before").map((f) => JSON.parse(readFileSync(f, "utf8")))
const after = list("--after").map((f) => JSON.parse(readFileSync(f, "utf8")))
const out = list("--out")[0]
const surfaces = (r) => Array.isArray(r.runs) && !r.raw
if (before.length && [...before, ...after].every(surfaces)) {
  const md = surfacesTable(before, after)
  if (out) writeFileSync(out, md)
  console.log(md)
  process.exit(0)
}
if (!before.length || !after.length) {
  console.error("usage: compare.mjs --before a.json [...] --after b.json [...] [--out file.md]")
  process.exit(2)
}

/**
 * surfaces.mjs results, one column a build: each metric's median over the
 * quiet runs (or every run, marked busy, when none was quiet), its runs' loads
 * and the share of runs it was measured in.
 */
function surfacesTable(before, after) {
  const side = (results) => {
    const runs = results.flatMap((r) => r.runs)
    const quiet = runs.filter((r) => !r.busy)
    const use = quiet.length ? quiet : runs
    const loads = runs.flatMap((r) => r.load ?? []).filter((x) => typeof x === "number")
    return { runs, quiet, use, busy: !quiet.length, load: loads.length ? `${Math.min(...loads)}-${Math.max(...loads)}` : "-", where: [...new Set(results.map((r) => `${r.device} ${r.cpu}x ${r.base}`))].join(", ") }
  }
  const sides = [side(before), ...(after.length ? [side(after)] : [])]
  const names = [...new Set(sides.flatMap((x) => x.runs.flatMap((r) => Object.keys(r.metrics ?? {}))))]
  const cell = (x, k) => {
    const vs = x.use.map((r) => r.metrics?.[k]).filter((v) => typeof v === "number" && Number.isFinite(v))
    const m = median(vs)
    return m === null ? "-" : `${Math.round(m * 10) / 10}${vs.length < x.use.length ? ` (${vs.length}/${x.use.length})` : ""}`
  }
  const head = sides.map((x, i) => `${after.length ? (i ? "after" : "before") : "median"}: ${x.where}; ${x.use.length} of ${x.runs.length} runs${x.busy ? `, all busy (load > ${BUSY_LOAD})` : " quiet"}, load ${x.load}`)
  const lines = [...head.map((h) => `- ${h}`), "", `| metric | ${sides.map((_, i) => (after.length ? (i ? "after" : "before") : "median")).join(" | ")} |`, `|---|${sides.map(() => "---|").join("")}`]
  for (const k of names) lines.push(`| ${k} | ${sides.map((x) => cell(x, k)).join(" | ")} |`)
  return lines.join("\n") + "\n"
}

// Every run of a step, across files.
const rowsOf = (results, n) => results.flatMap((r) => r.raw.flatMap((run) => run.steps.filter((s) => s.n === n)))
const names = new Map()
for (const r of [...before, ...after]) for (const run of r.raw) for (const s of run.steps) names.set(s.n, s.step)

const med = (rows, pick) => median(rows.map(pick).filter((v) => v !== null && v !== undefined))
const fmt = (v, digits = 0) => (v === null || v === undefined ? "-" : digits ? v.toFixed(digits) : String(Math.round(v)))
const pair = (b, a, digits = 0) => `${fmt(b, digits)} → ${fmt(a, digits)}`

const lines = [
  `| # | step | ready ms | INP ms | key p95 ms | renders (per key) | long tasks ms | CLS |`,
  `|---|---|---|---|---|---|---|---|`,
]
for (const [n, step] of [...names.entries()].sort((x, y) => x[0] - y[0])) {
  const b = rowsOf(before, n)
  const a = rowsOf(after, n)
  if (!b.length || !a.length) continue
  const keyed = b.some((s) => s.keys) || a.some((s) => s.keys)
  const renders = keyed
    ? pair(med(b, (s) => s.rendersPerKey), med(a, (s) => s.rendersPerKey), 1)
    : pair(med(b, (s) => s.renders), med(a, (s) => s.renders))
  lines.push(
    `| ${n} | ${step} | ${pair(med(b, (s) => s.ready), med(a, (s) => s.ready))} | ${pair(med(b, (s) => s.inp), med(a, (s) => s.inp))} | ${keyed ? pair(med(b, (s) => s.keys?.p95), med(a, (s) => s.keys?.p95)) : "-"} | ${renders} | ${pair(med(b, (s) => s.longMs), med(a, (s) => s.longMs))} | ${pair(med(b, (s) => s.cls), med(a, (s) => s.cls), 3)} |`,
  )
}
const routes = (r) => r.find((x) => x.routes)?.routes
const rb = routes(before)
const ra = routes(after)
if (rb && ra) {
  lines.push("", "| route | scripts | JavaScript, gzip KB |", "|---|---|---|")
  for (const x of rb) {
    const y = ra.find((z) => z.route === x.route)
    if (y) lines.push(`| ${x.route} | ${x.scripts} → ${y.scripts} | ${x.gzipKB} → ${y.gzipKB} |`)
  }
}
const md = lines.join("\n") + "\n"
if (out) writeFileSync(out, md)
console.log(md)
