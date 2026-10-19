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

import { reach, sourceBytes } from "./reach.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const has = (n) => args.includes(`--${n}`)

export const CEILINGS_FILE = join(here, "route-ceilings.json")

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

/** Every page.tsx under app/, as repository paths. */
export function pageFiles(root = "app") {
  const out = []
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) visit(p)
      else if (e.name === "page.tsx") out.push(p.split(sep).join("/"))
    }
  }
  visit(root)
  return out.sort()
}

/**
 * Each route's first-load gzip bytes in the build at `next`: a Map from its
 * page file to { bytes, files }. The runtime (rootMainFiles, no polyfills:
 * those load only in old browsers), then every layout on the route's path and
 * the page.
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
        const m2 = /^\[project\]\/app(.*)\/(layout|page)$/.exec(segment)
        if (!m2) continue
        const at = m2[1]
        // The root layout, each layout above the page, and the page itself.
        if (at === "" || dir === at || dir.startsWith(`${at}/`)) for (const c of chunks) files.add(c.replace(/^\//, ""))
      }
      let bytes = 0
      for (const f of files) bytes += sizeOf(f)
      out.set(pageFileOf(key), { bytes, files: files.size })
    }
  }
  return out
}

/** The one table of route ceilings. */
export function readCeilings(file = CEILINGS_FILE) {
  return JSON.parse(readFileSync(file, "utf8"))
}

/** A ceiling with room for the work queued behind it: `pct` over, rounded up to `step`. */
export function roomy(value, pct, step) {
  return Math.ceil((value * (1 + pct / 100)) / step) * step
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
    rows.push({ metric: `${file} gzipKB`, scenario: "routes", value: kb, max: c?.gzipKB ?? null, target: c?.target?.gzipKB ?? null, owner: c?.owner ?? "", ok: c?.gzipKB === undefined ? null : kb <= c.gzipKB, enforced: true })
  }
  // A line with no route in this build: stale, unless it's a page only the AI
  // edition has and this is the edition without AI (no file for it at all).
  const stale = Object.keys(ceilings).filter((f) => ceilings[f].gzipKB !== undefined && !weights.has(f) && (existsSync(f) || ceilings[f].edition !== "ai"))

  if (has("propose")) {
    const proposal = {}
    for (const file of pageFiles()) {
      const w = weights.get(file)
      const was = ceilings[file] ?? {}
      const source = sourceBytes(reach(file))
      const gzipKB = w ? Math.round(w.bytes / 1024) : undefined
      proposal[file] = {
        ...was,
        // Never above what the table already says: a ceiling only goes down.
        source: Math.min(was.source ?? Infinity, roomy(source, 1.5, 1000)),
        ...(gzipKB !== undefined ? { gzipKB: Math.min(was.gzipKB ?? Infinity, roomy(gzipKB, 1.5, 1)) } : {}),
      }
    }
    console.log(JSON.stringify(proposal, null, 2))
    process.exit(0)
  }

  const w = Math.max(...rows.map((r) => r.metric.length)) + 2
  console.log("route (first-load script, gzip KB)".padEnd(w), "KB".padStart(6), "ceiling".padStart(8), "target".padStart(7), " verdict")
  for (const r of rows) {
    const v = r.ok === null ? "NO CEILING" : r.ok ? "ok" : "OVER"
    console.log(r.metric.padEnd(w), String(r.value).padStart(6), String(r.max ?? "-").padStart(8), String(r.target ?? "").padStart(7), "", v)
  }
  for (const f of stale) console.log(`${f}: a ceiling with no route in this build (renamed or gone? take its line out)`)
  const result = opt("result", null)
  if (result) writeFileSync(result, JSON.stringify({ scenario: "routes", next: relative(process.cwd(), next) || ".", checks: rows, stale }, null, 2))

  if (has("check")) {
    const over = rows.filter((r) => r.ok === false)
    const none = rows.filter((r) => r.ok === null)
    if (over.length || none.length || stale.length) {
      if (over.length) console.log(`\n${over.length} route(s) over their ceiling: make what they bring lazy (next/dynamic, import()) rather than raising it.`)
      if (none.length) console.log(`${none.length} route(s) with no ceiling: add each to scripts/fluidity/route-ceilings.json (routes.mjs --propose prints the line).`)
      process.exit(1)
    }
    console.log(`\nall ${rows.length} routes under their ceilings`)
  }
}
