#!/usr/bin/env node
// Before and after, side by side: medians across any number of measure.mjs
// runs of each, as a markdown table.
//
//   node scripts/fluidity/compare.mjs --before a.json b.json --after c.json d.json [--out table.md]
//
// Run the two builds alternately (before, after, before, after...) rather
// than one after the other: a busy machine slows whichever runs during the
// busy minutes, and alternating shares that out.
import { readFileSync, writeFileSync } from "node:fs"
import { median } from "./lib.mjs"

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
if (!before.length || !after.length) {
  console.error("usage: compare.mjs --before a.json [...] --after b.json [...] [--out file.md]")
  process.exit(2)
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
