#!/usr/bin/env node
// Every route's first-load script, from a production build: the gzip bytes of
// the JavaScript a route loads before anything is clicked (the runtime, each
// layout above it and the page; a dynamic import() is a chunk of its own and
// isn't counted), held to route-ceilings.json beside this file, the one table
// of route ceilings. app/firstLoad.test.ts holds the same table's source
// ceilings on every quick check, with no build.
//
//   pnpm next build
//   node scripts/fluidity/routes.mjs            # the table, every route
//   node scripts/fluidity/routes.mjs --check    # exits 1 on a ceiling missed, a
//                                               # route with no ceiling, or a
//                                               # ceiling with no route
//   node scripts/fluidity/routes.mjs --propose  # ceilings for this build, to paste
//   options: --next <dir> (default .next)  --budgets <file> (default route-ceilings.json)
//            --result <file> (the rows, as run.mjs reads them; --base, --cpu and
//            --runs are taken and ignored: a build has no speed)
//
// It reads the build's own manifests (Next 16, Turbopack): build-manifest.json
// for the runtime, and each page's client reference manifest for its
// segments' chunks. Deterministic: the same build gives the same bytes on any
// machine, so this is the speed check the integrator's full gate runs after
// its build (17 Oct 2026). Times stay with the scenarios (run.mjs).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { ROUTE_SEGMENTS, isPageFile, reach, routeReach, sourceBytes } from "./reach.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const has = (n) => args.includes(`--${n}`)

export const CEILINGS_FILE = join(here, "route-ceilings.json")
/**
 * An entry segment of the client reference manifest: "[project]/app/<folder>/<layout, error, …, page>",
 * or a metadata entry, "[project]/app/<folder>/<name>--metadata" (Next 16), whose chunk the page's HTML
 * lists too.
 */
const SEGMENT = new RegExp(`^\\[project\\]\\/app(.*)\\/(${[...ROUTE_SEGMENTS, "page"].join("|")}|[^/]+--metadata)$`)

/**
 * The file a client manifest's route key names: "/app/home/page" ->
 * "app/app/home/page.tsx". Next's own routes are named for the file that
 * makes them: "/_not-found/page" -> "app/not-found.tsx" (every missing
 * page's first load), "/_global-error/page" -> "app/global-error.tsx".
 */
export function pageFileOf(key) {
  const own = /^\/_([a-z-]+)\/page$/.exec(key)
  if (own) return `app/${own[1]}.tsx`
  return `app${key}.tsx`
}

/** Every page under app/ (reach.mjs isPageFile), as repository paths. */
export function pageFiles(root = "app") {
  const out = []
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) visit(p)
      else if (isPageFile(e.name)) out.push(p.split(sep).join("/"))
    }
  }
  visit(root)
  return out.sort()
}

/**
 * Each route's first-load gzip bytes in the build at `next`: a Map from its
 * page file to { bytes, files, chunks }. The runtime (rootMainFiles, no polyfills:
 * those load only in old browsers), then every entry segment on the route's
 * path (reach.mjs ROUTE_SEGMENTS: layouts and boundaries, and each metadata
 * entry, whose chunk the HTML lists as well) and the page: what its HTML
 * lists (V-49).
 */
export function routeWeights(next = ".next") {
  const bm = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8"))
  const runtime = (bm.rootMainFiles ?? []).filter((f) => f.endsWith(".js"))
  const gz = new Map()
  const sizeOf = (f) => {
    const rel = f.replace(/^\//, "")
    if (!gz.has(rel)) {
      const p = join(next, rel)
      gz.set(rel, existsSync(p) ? gzipSync(readFileSync(p), { level: 9 }).length : 0)
    }
    return gz.get(rel)
  }
  const manifests = []
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) visit(p)
      else if (e.name === "page_client-reference-manifest.js") manifests.push(p)
    }
  }
  visit(join(next, "server", "app"))
  const out = new Map()
  for (const m of manifests) {
    const holder = { __RSC_MANIFEST: {} }
    new Function("globalThis", readFileSync(m, "utf8"))(holder)
    for (const [key, manifest] of Object.entries(holder.__RSC_MANIFEST)) {
      if (!key.endsWith("/page")) continue
      const dir = key.replace(/\/page$/, "")
      const files = new Set(runtime.map((f) => f.replace(/^\//, "")))
      for (const [segment, chunks] of Object.entries(manifest.entryJSFiles ?? {})) {
        const m2 = SEGMENT.exec(segment)
        if (!m2) continue
        const at = m2[1]
        // The root's segments, each one above the page, and the page's own.
        if (at === "" || dir === at || dir.startsWith(`${at}/`)) for (const c of chunks) files.add(c.replace(/^\//, ""))
      }
      let bytes = 0
      for (const f of files) bytes += sizeOf(f)
      out.set(pageFileOf(key), { bytes, files: files.size, chunks: [...files].sort() })
    }
  }
  return out
}

/** The one table of route ceilings. */
export function readCeilings(file = CEILINGS_FILE) {
  return JSON.parse(readFileSync(file, "utf8"))
}

/** A kilobyte, as every route line counts one. */
export const KB = 1024

/**
 * The room a route line keeps above its measure (main's V-49 amendment, 29 Oct
 * 2026): max(2 KB, 1%) for a source line, in bytes, and max(1 KB, 1%) for a
 * gzip line, in KB. Exact lines froze every route: a feature that added a byte
 * had to find equal savings on its route first.
 */
export function headroom(kind, measure) {
  return kind === "source" ? Math.max(2 * KB, Math.ceil(measure / 100)) : Math.max(1, Math.ceil(measure / 100))
}

/** A source line's measure: a page's route (routeReach), any other file's own reach. */
export function sourceMeasure(file) {
  return sourceBytes(isPageFile(file) ? routeReach(file) : reach(file))
}

/** A route line for a measure: the measure plus its headroom. */
export function lineFor(kind, measure) {
  return measure + headroom(kind, measure)
}

/**
 * What's wrong with a route line against its measure, or null. A measure over
 * its line; or a line more than twice its headroom above its measure, slack
 * that a route which shrank left behind, to ratchet down to lineFor. Lines
 * never rise: growth past the headroom needs main's yes.
 */
export function lineProblem(kind, measure, line) {
  if (measure > line) return `${measure} is over its line ${line}`
  const room = headroom(kind, measure)
  if (line - measure > 2 * room) return `the line ${line} is more than twice its headroom (${room}) above the measure ${measure}: ratchet this line down to ${lineFor(kind, measure)}`
  return null
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const next = opt("next", ".next")
  if (!existsSync(join(next, "build-manifest.json"))) {
    console.error(`No production build at ${next}: run \`pnpm next build\` first.`)
    process.exit(2)
  }
  const weights = routeWeights(next)
  const table = readCeilings(opt("budgets", CEILINGS_FILE))
  const ceilings = table.routes ?? {}
  const rows = []
  for (const [file, w] of [...weights].sort((a, b) => b[1].bytes - a[1].bytes)) {
    const c = ceilings[file]
    const kb = Math.round(w.bytes / 1024)
    const problem = c?.gzipKB === undefined ? null : lineProblem("gzipKB", kb, c.gzipKB)
    rows.push({ metric: `${file} gzipKB`, scenario: "routes", value: kb, max: c?.gzipKB ?? null, target: c?.target?.gzipKB ?? null, owner: c?.owner ?? "", ok: c?.gzipKB === undefined ? null : !problem, problem, enforced: true })
  }
  // A line with no route in this build: stale, unless it's a page only the AI
  // edition has and this is the edition without AI (no file for it at all).
  const stale = Object.keys(ceilings).filter((f) => ceilings[f].gzipKB !== undefined && !weights.has(f) && (existsSync(f) || ceilings[f].edition !== "ai"))

  if (has("propose")) {
    const proposal = {}
    // Every line, page and non-page, and any new page: its measure plus its
    // headroom (lineFor), never above the line it has (lines never rise).
    for (const file of [...new Set([...Object.keys(ceilings), ...pageFiles()])].filter((f) => existsSync(f)).sort()) {
      const w = weights.get(file)
      const was = ceilings[file] ?? {}
      const gzipKB = w ? Math.round(w.bytes / 1024) : undefined
      proposal[file] = {
        ...was,
        source: Math.min(was.source ?? Infinity, lineFor("source", sourceMeasure(file))),
        ...(gzipKB !== undefined ? { gzipKB: Math.min(was.gzipKB ?? Infinity, lineFor("gzipKB", gzipKB)) } : {}),
      }
    }
    console.log(JSON.stringify(proposal, null, 2))
    process.exit(0)
  }

  const w = Math.max(...rows.map((r) => r.metric.length)) + 2
  console.log("route (first-load script, gzip KB)".padEnd(w), "KB".padStart(6), "ceiling".padStart(8), "target".padStart(7), " verdict")
  for (const r of rows) {
    const v = r.ok === null ? "NO CEILING" : r.ok ? "ok" : r.problem
    console.log(r.metric.padEnd(w), String(r.value).padStart(6), String(r.max ?? "-").padStart(8), String(r.target ?? "").padStart(7), "", v)
  }
  for (const f of stale) console.log(`${f}: a ceiling with no route in this build (renamed or gone? take its line out)`)
  const result = opt("result", null)
  if (result) writeFileSync(result, JSON.stringify({ scenario: "routes", next: relative(process.cwd(), next) || ".", checks: rows, stale }, null, 2))

  if (has("check")) {
    const over = rows.filter((r) => r.ok === false)
    const none = rows.filter((r) => r.ok === null)
    if (over.length || none.length || stale.length) {
      if (over.length) console.log(`\n${over.length} route line(s) failed: a route over its line makes what it brings lazy (next/dynamic, import()) rather than raising it; a line with slack is ratcheted down as it says.`)
      if (none.length) console.log(`${none.length} route(s) with no ceiling: add each to scripts/fluidity/route-ceilings.json (routes.mjs --propose prints the line).`)
      process.exit(1)
    }
    console.log(`\nall ${rows.length} routes under their ceilings`)
  }
}
