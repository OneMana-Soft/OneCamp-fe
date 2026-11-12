// Every route's lazy script, from a production build: the chunks its dynamic
// imports can load after its first load, each file alone in raw and gzip -9
// bytes, beside its first load (routes.mjs) and the whole static/chunks.
//
//   node scripts/fluidity/lazychunks.mjs <.next>                       # every route
//   node scripts/fluidity/lazychunks.mjs <before .next> <after .next>  # the change: the summary lines
//   options: --table (with two builds, every route's change) --route <text>
//            (only the page files that contain it; repeatable) --json
//
// Why (V-896, main 11 Nov 2026): a size table counted a head's lazy chunks by
// what they contain (content markers), and the two chunks Turbopack cut from
// one new dynamic import (once per set of modules its parents already hold)
// carried none of them, so the head read +23,352 raw / +8,541 gz against a
// true +35,875 / +14,119, under its grant while it was over. So a route's lazy
// chunks are read from the build, never from their content: every script its
// react-loadable-manifest.json lists (next/dynamic), and every script a lazy
// loader names ("e.v(t=>Promise.all([\"static/chunks/…\"].map(…)))", an
// import() or lazyChunk() the manifest never lists, such as the tooltip's
// chip), followed from its first load through every chunk they reach, minus
// the first load. `manifest` is the manifest's scripts alone, the reading of
// earlier tables (FLUIDITY-16 lazybytes.mjs). Scripts only: styles have their
// own measure. A file the build names but doesn't hold is counted in
// `missing`, never in bytes. Read-only.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { CHUNK_NAME, routeWeights } from "./routes.mjs"

/** @typedef {[raw: number, gzip: number, files: number]} Weight */

/**
 * Every route's first load and lazy scripts in the build at `next`, and the
 * whole static/chunks folder's.
 * @param {string} [next]
 */
export function lazyWeights(next = ".next") {
  if (!existsSync(join(next, "build-manifest.json"))) throw new Error(`not a build: ${next} (no build-manifest.json)`)
  const held = new Map()
  const has = (f) => {
    if (!held.has(f)) held.set(f, existsSync(join(next, f)))
    return held.get(f)
  }
  const sizes = new Map()
  /** @param {Iterable<string>} files @returns {Weight} */
  const sum = (files) => {
    const w = /** @type {Weight} */ ([0, 0, 0])
    for (const f of files) {
      if (!sizes.has(f)) {
        const b = readFileSync(join(next, f))
        sizes.set(f, [b.length, gzipSync(b, { level: 9 }).length])
      }
      const [raw, gz] = sizes.get(f)
      w[0] += raw
      w[1] += gz
      w[2]++
    }
    return w
  }
  const names = new Map()
  /** The scripts a chunk names: what its lazy loaders fetch. */
  const named = (f) => {
    if (!names.has(f)) {
      const all = [...readFileSync(join(next, f), "utf8").matchAll(CHUNK_NAME)].map((m) => m[0])
      names.set(f, [...new Set(all.filter((n) => n.endsWith(".js")))])
    }
    return names.get(f)
  }

  const routes = new Map()
  const loaded = new Set()
  for (const [route, { chunks, key }] of routeWeights(next)) {
    const first = new Set(chunks.filter(has))
    const folder = key.replace(/^\//, "").replace(/\/?page$/, "")
    const file = join(next, "server", "app", folder, "page", "react-loadable-manifest.json")
    /** @type {{ files?: string[] }[]} */
    const entries = existsSync(file) ? Object.values(JSON.parse(readFileSync(file, "utf8"))) : []
    const listed = new Set(entries.flatMap((e) => e.files ?? []).map((f) => f.replace(/^\//, "")).filter((f) => f.endsWith(".js")))
    const seen = new Set()
    const lazy = new Set()
    const missing = new Set()
    const todo = [...first, ...listed]
    while (todo.length) {
      const f = /** @type {string} */ (todo.pop())
      if (seen.has(f)) continue
      seen.add(f)
      if (!has(f)) {
        missing.add(f)
        continue
      }
      if (!first.has(f)) lazy.add(f)
      for (const n of named(f)) if (!seen.has(n)) todo.push(n)
    }
    for (const f of [...first, ...lazy]) loaded.add(f)
    routes.set(route, {
      first: sum(first),
      lazy: sum(lazy),
      manifest: sum([...listed].filter((f) => has(f) && !first.has(f))),
      dynamicImports: entries.length,
      missing: missing.size,
      chunks: [...lazy].sort(),
    })
  }

  const all = []
  const walk = (d, rel) => {
    for (const e of readdirSync(join(next, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${rel}${e.name}/`)
      else all.push(`${rel}${e.name}`)
    }
  }
  if (existsSync(join(next, "static", "chunks"))) walk(join("static", "chunks"), "static/chunks/")
  const js = all.filter((f) => f.endsWith(".js"))
  const build = {
    js: sum(js),
    css: sum(all.filter((f) => f.endsWith(".css"))),
    all: sum(all),
    unreached: sum(js.filter((f) => !loaded.has(f))),
  }
  return { routes, build }
}

const signed = (n) => `${n >= 0 ? "+" : ""}${n}`

/** "raw <a> -> <b> (<d>) gz <a> -> <b> (<d>) files <a> -> <b>", or one weight's "raw <a> gz <b> files <n>". */
export function weightLine(/** @type {Weight | null} */ a, /** @type {Weight | null} */ b) {
  if (!b) return `raw ${a?.[0] ?? 0} gz ${a?.[1] ?? 0} files ${a?.[2] ?? 0}`
  const x = a ?? [0, 0, 0]
  return `raw ${x[0]} -> ${b[0]} (${signed(b[0] - x[0])}) gz ${x[1]} -> ${b[1]} (${signed(b[1] - x[1])}) files ${x[2]} -> ${b[2]}`
}

/**
 * What the change from `before` to `after` did to every route's lazy and
 * first-load scripts, and to the whole folder: one row per page file, sorted.
 * @param {string} before
 * @param {string} after
 */
export function lazyDiff(before, after) {
  const a = lazyWeights(before)
  const b = lazyWeights(after)
  const rows = [...new Set([...a.routes.keys(), ...b.routes.keys()])].sort().map((route) => {
    const x = a.routes.get(route)
    const y = b.routes.get(route)
    /** @param {"first" | "lazy" | "manifest"} k */
    const pair = (k) => ({ before: x ? x[k] : null, after: y ? y[k] : null, delta: [0, 1, 2].map((i) => (y ? y[k][i] : 0) - (x ? x[k][i] : 0)) })
    const lazy = pair("lazy")
    const verdict = !x ? "NEW" : !y ? "GONE" : lazy.delta[0] || lazy.delta[1] || lazy.delta[2] ? "moved" : "same"
    const gained = y ? y.chunks.filter((c) => !x?.chunks.includes(c)) : []
    const lost = x ? x.chunks.filter((c) => !y?.chunks.includes(c)) : []
    return { route, verdict, lazy, manifest: pair("manifest"), first: pair("first"), gained, lost }
  })
  return { rows, build: { before: a.build, after: b.build } }
}

/**
 * The summary: how many routes' lazy scripts moved, by how much at the
 * extremes, then the whole folder's scripts, styles and files.
 * @param {ReturnType<typeof lazyDiff>} diff
 */
export function summaryLines({ rows, build }) {
  const moved = rows.filter((r) => r.verdict === "moved")
  const span = (i) => (moved.length ? `${signed(Math.min(...moved.map((r) => r.lazy.delta[i])))}..${signed(Math.max(...moved.map((r) => r.lazy.delta[i])))}` : "0")
  const count = (v) => rows.filter((r) => r.verdict === v).length
  const more = ["NEW", "GONE"].filter((v) => count(v)).map((v) => `, ${count(v)} ${v}`).join("")
  return [
    `routes ${rows.length}: lazy scripts moved on ${moved.length} (raw ${span(0)}, gz ${span(1)}), ${count("same")} same${more}`,
    ...["js", "css", "all", "unreached"].map((k) => `static/chunks ${k} ${weightLine(build.before[k], build.after[k])}`),
  ]
}

/**
 * One route's change: its lazy scripts (and the manifest's alone), its first
 * load, and the lazy chunks only one build has.
 * @param {ReturnType<typeof lazyDiff>["rows"][number]} row
 */
export function rowLine({ route, verdict, lazy, manifest, first, gained, lost }) {
  const d = (p) => `raw ${signed(p.delta[0])} gz ${signed(p.delta[1])} (files ${p.before?.[2] ?? "-"} -> ${p.after?.[2] ?? "-"})`
  return `  ${route} lazy ${d(lazy)} manifest ${d(manifest)} first ${d(first)} chunks +${gained.length} -${lost.length} ${verdict}`
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const builds = []
  const only = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--route") only.push(args[++i] ?? "")
    else if (!args[i].startsWith("--")) builds.push(args[i])
  }
  if (builds.length < 1 || builds.length > 2) {
    console.error("usage: node scripts/fluidity/lazychunks.mjs <.next> | <before .next> <after .next> [--table] [--route <text>]... [--json]")
    process.exit(2)
  }
  const wanted = (route) => !only.length || only.some((t) => route.includes(t))
  if (builds.length === 1) {
    const { routes, build } = lazyWeights(builds[0])
    if (args.includes("--json")) console.log(JSON.stringify({ routes: Object.fromEntries([...routes].filter(([r]) => wanted(r))), build }))
    else {
      for (const k of ["js", "css", "all", "unreached"]) console.log(`static/chunks ${k} ${weightLine(build[k], null)}`)
      for (const [route, w] of [...routes].sort((p, q) => p[0].localeCompare(q[0]))) {
        if (!wanted(route)) continue
        console.log(`  ${route} first ${weightLine(w.first, null)} lazy ${weightLine(w.lazy, null)} manifest ${weightLine(w.manifest, null)} (dynamic imports ${w.dynamicImports}, missing ${w.missing})`)
      }
    }
  } else {
    const diff = lazyDiff(builds[0], builds[1])
    const rows = diff.rows.filter((r) => wanted(r.route))
    if (args.includes("--json")) console.log(JSON.stringify({ ...diff, rows }))
    else {
      for (const line of summaryLines({ ...diff, rows })) console.log(line)
      if (args.includes("--table") || only.length) for (const row of rows) console.log(rowLine(row))
    }
  }
}
