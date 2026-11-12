// How many copies of each module a build's static/chunks hold, and their raw
// bytes, between two builds: the modules whose bytes moved most, with their
// copy counts; the regroups (a module both builds have that gains a copy);
// and the hoists (a module merged into another factory in one build, alone in
// the other).
//
//   node scripts/fluidity/modcopies.mjs <before> <after>                # summary, then the 25 modules that moved most
//   options: --top <n>   --ids <id,id,…> (each one's copies, bytes, chunks and
//            merge partners in each build)   --json
//   <before>, <after>: a .next, or a static/chunks folder
//
// Why (V-926, main 11 Nov 2026): Turbopack writes a factory it scope-hoisted
// several modules into once, under all their ids ("967471,218059,e=>{…}"). A
// count that read one id per factory credited it to 218059 alone, so a module
// whose copies never changed read "0 -> 3 copies" the build it was hoisted
// in, and hid the real regroup. Here each module a merged factory makes is a
// copy of its own, with its own part of the code (routes.mjs factoryParts; a
// module with no export of its own costs 0 B there), and every row of a module
// that shares a factory in either build says "merged" and with which. Read-only.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { chunkFactories, factoryParts } from "./routes.mjs"

/**
 * Every module in a build's chunks: a Map from its id to its copies, one per
 * factory that makes it: { chunk, bytes, with } (`with`: the other ids its
 * factory makes, empty when alone), and a short snippet of its code.
 * @param {string} build a .next, or a static/chunks folder
 * @returns {Map<string, { copies: { chunk: string, bytes: number, with: string[] }[], snippet: string }>}
 */
export function moduleCopies(build) {
  const dir = existsSync(join(build, "static", "chunks")) ? join(build, "static", "chunks") : build
  if (!existsSync(dir)) throw new Error(`no chunks at ${build}`)
  const out = new Map()
  for (const chunk of readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const src = readFileSync(join(dir, chunk), "utf8")
    for (const { ids, from, to } of chunkFactories(src)) {
      const text = src.slice(from, to)
      const parts = factoryParts(text, ids)
      for (const id of ids) {
        const part = parts.find((p) => p.id === id)
        const m = out.get(id) ?? { copies: [], snippet: "" }
        m.copies.push({ chunk, bytes: part ? Buffer.byteLength(part.text) : 0, with: ids.filter((x) => x !== id) })
        if (!m.snippet && part) m.snippet = part.text.slice(part === parts[0] ? ids.join(",").length + 1 : 0).slice(0, 60)
        out.set(id, m)
      }
    }
  }
  return out
}

/** The ids a module shares a factory with in any of its copies, or null when every copy is alone. */
const mergedWith = (m) => {
  const w = [...new Set(m?.copies.flatMap((c) => c.with) ?? [])]
  return w.length ? w : null
}

/**
 * What the change from `before` to `after` did to each module's copies and
 * bytes: every module whose bytes or copy count moved, the biggest move first.
 * @param {string} before
 * @param {string} after
 */
export function copiesDiff(before, after) {
  const a = moduleCopies(before)
  const b = moduleCopies(after)
  const side = (m) => ({
    copies: m ? m.copies.length : 0,
    bytes: m ? m.copies.reduce((s, c) => s + c.bytes, 0) : 0,
    merged: mergedWith(m),
  })
  const rows = []
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = side(a.get(id))
    const y = side(b.get(id))
    if (x.copies === y.copies && x.bytes === y.bytes && Boolean(x.merged) === Boolean(y.merged)) continue
    rows.push({ id, before: x, after: y, delta: y.bytes - x.bytes, snippet: (b.get(id) ?? a.get(id))?.snippet ?? "" })
  }
  rows.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta) || p.id.localeCompare(q.id))
  const factories = (m) => {
    const keys = new Set()
    let members = 0
    for (const [id, { copies }] of m) {
      if (!copies.some((c) => c.with.length)) continue
      members++
      for (const c of copies) if (c.with.length) keys.add(`${c.chunk}:${[id, ...c.with].sort().join(",")}`)
    }
    return { factories: keys.size, members }
  }
  return {
    before: { modules: a.size, ...factories(a) },
    after: { modules: b.size, ...factories(b) },
    added: [...b.keys()].filter((id) => !a.has(id)).length,
    gone: [...a.keys()].filter((id) => !b.has(id)).length,
    regroup: rows.filter((r) => r.before.copies > 0 && r.after.copies > r.before.copies).map((r) => r.id),
    fewer: rows.filter((r) => r.after.copies > 0 && r.after.copies < r.before.copies).map((r) => r.id),
    hoists: rows.filter((r) => r.before.copies > 0 && r.after.copies > 0 && Boolean(r.before.merged) !== Boolean(r.after.merged)).map((r) => r.id),
    netBytes: rows.reduce((s, r) => s + r.delta, 0),
    rows,
    copies: { before: a, after: b },
  }
}

const signed = (n) => `${n >= 0 ? "+" : ""}${n}`
const mergedNote = (s, when) => (s.merged ? ` merged ${when} with ${s.merged.slice(0, 4).join("+")}${s.merged.length > 4 ? "+…" : ""}` : "")

/**
 * One module's line: its bytes' move, copies and bytes in each build, and
 * "merged" with its partners in either build.
 * @param {ReturnType<typeof copiesDiff>["rows"][number]} row
 */
export function rowLine({ id, before, after, delta, snippet }) {
  return `${signed(delta)} ${id} copies ${before.copies} -> ${after.copies} bytes ${before.bytes} -> ${after.bytes}${mergedNote(before, "before")}${mergedNote(after, "after")} ${JSON.stringify(snippet)}`
}

/**
 * The summary lines: modules and merged factories in each build, then the
 * regroups, fewer copies and hoists.
 * @param {ReturnType<typeof copiesDiff>} diff
 */
export function summaryLines(diff) {
  const { before: x, after: y } = diff
  return [
    `modules ${x.modules} -> ${y.modules} (new ${diff.added}, gone ${diff.gone}); merged factories ${x.factories} -> ${y.factories}, making ${x.members} -> ${y.members} modules`,
    `modules changed ${diff.rows.length}, net raw ${signed(diff.netBytes)}; REGROUP ${diff.regroup.length} (modules that gain a copy), fewer copies ${diff.fewer.length}; hoisted ${diff.hoists.length} (merged in one build, alone in the other${diff.hoists.length ? `: ${diff.hoists.slice(0, 8).join(", ")}${diff.hoists.length > 8 ? ", …" : ""}` : ""})`,
  ]
}

/**
 * One id in one build: its copies, bytes, chunks and partners.
 * @param {ReturnType<typeof moduleCopies>} copies
 * @param {string} id
 */
export function idLine(copies, id) {
  const m = copies.get(id)
  if (!m) return `copies 0`
  const bytes = m.copies.reduce((s, c) => s + c.bytes, 0)
  const merged = m.copies.filter((c) => c.with.length)
  const partners = mergedWith(m)
  return `copies ${m.copies.length} bytes ${bytes}${partners ? ` merged in ${merged.length} with ${partners.join("+")}` : ""} chunks ${m.copies.map((c) => c.chunk).join(" ")}`
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const value = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined)
  const flags = new Set(["--top", "--ids"])
  const builds = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]))
  if (builds.length !== 2) {
    console.error("usage: node scripts/fluidity/modcopies.mjs <before .next> <after .next> [--top <n>] [--ids <id,id,…>] [--json]")
    process.exit(2)
  }
  const diff = copiesDiff(builds[0], builds[1])
  const ids = value("ids")
  if (args.includes("--json")) console.log(JSON.stringify({ ...diff, copies: undefined }))
  else if (ids) {
    for (const id of ids.split(",")) {
      console.log(`${id} before: ${idLine(diff.copies.before, id)}`)
      console.log(`${id} after: ${idLine(diff.copies.after, id)}`)
    }
  } else {
    for (const line of summaryLines(diff)) console.log(line)
    for (const row of diff.rows.slice(0, Number(value("top") ?? 25))) console.log(rowLine(row))
  }
}
