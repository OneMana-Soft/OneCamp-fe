// What a change between two production builds did to each route's first-load
// script: its SHIPPED gzip bytes (routes.mjs) beside its CANONICAL ones, and a
// verdict: REAL (the code moved), RE-CUT (only the chunker moved) or same.
//
//   node scripts/fluidity/canondiff.mjs <before .next> <after .next>          # the summary line
//   node scripts/fluidity/canondiff.mjs <before .next> <after .next> --table  # and every route
//   node scripts/fluidity/canondiff.mjs <before .next> <after .next> --json   # the rows, to join a table
//
// A build folder is a .next, or a copy holding its build-manifest.json, its
// server/app/**/page_client-reference-manifest.js and its static/chunks.
//
// Why (V-154; main's ruling, 31 Oct 2026, "Size is judged on canonical
// bytes"): Turbopack merges a chunk group's chunks size-greedily, so a head
// that grows one lazy group can move the boundaries and the order of modules
// it never touched, and SWC picks short names per chunk, so a module that
// moves comes out with other one- and two-letter names. The same code then
// ships as other bytes on routes the head never touched. No chunking setting
// is stable without trading first load for navigation.
//
// Canonical bytes: the route's chunks (the same ones its shipped bytes count),
// split into modules (a Turbopack chunk is ".push([script, id, factory, id,
// factory, …])"), each module once and cut at its factory's end, with every
// chunk name masked, every list of them read as one (a lazy loader lists as
// many as its group has) and every one- or two-character name masked; chunks
// with no modules (the runtime) whole, masked and sorted; then one gzip -9
// stream. They move when shipped code moves, whatever the chunker did with
// boundaries, order, names or a lazy group's chunk count.
//
// Module ids and the build id are the build's, not the code's (V-172):
// Turbopack numbers modules per build, so an unchanged module can come out
// with another id, and every module that names it by that id changes with
// it; and a module may embed the build's id, which differs between any two
// builds. So a module's own id and every id code names it by are masked, the
// build id is masked, and the modules are sorted by their masked text (read
// as a multiset), never by id.
//
// Verdicts, on the +/-8 B band: REAL when the canonical delta is outside it
// (charged as before, V-49 lines included); RE-CUT when only the shipped delta
// is (recorded, never charged or granted); same when neither moved; NEW or
// GONE when only one build has the route. The absolute ceilings (routes.mjs
// --check) stay the backstop on every route. Read-only.

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { routeWeights } from "./routes.mjs"

/** The band, in gzip bytes, within which a route counts as unmoved. */
export const BAND = 8

/**
 * Where a module starts in a Turbopack chunk: "," or "[", its id (digits, or
 * the minifier's exponent form, 2e6), "," and its factory, a function or an
 * arrow.
 */
const MODULE = /[,[](\d{2,7}|\d{1,6}e\d{1,2}),(?=\(?[a-zA-Z_$]*[,)]?\s*=>|function|\([a-zA-Z_$,]*\)\s*=>|[a-zA-Z_$]+=>)/g
/** A chunk's closing, after its last module: "])", ";" and comment lines (the source map's). */
const CLOSING = /^\]\)\s*;?(?:\s*\/\/[^\n]*(?:\n|$))*\s*$/
const CHUNK_NAME = /static\/chunks\/[A-Za-z0-9_.~-]+\.(?:js|css)/g
/** A list of masked chunk names, as a lazy loader writes the chunks it fetches. */
const CHUNK_LIST = /(["'])static\/chunks\/C\.js\1(?:\s*,\s*\1static\/chunks\/C\.js\1)+/g
const SHORT_NAME = /(?<![A-Za-z0-9_$])[A-Za-z_$][A-Za-z0-9_$]?(?![A-Za-z0-9_$])/g
/**
 * A module id: digits, or the minifier's exponent form (2e6), tried first, so
 * that a list's ids masked one by one take "26e4" whole, never "26" alone.
 */
const ID = String.raw`(?:\d{1,6}e\d{1,2}|\d{2,7})`
/**
 * Where code names a module by its id, once maskNames ran: the runtime's
 * calls (e.i(id) imports, e.r(id) requires, e.A(id) async imports: "_._(id)")
 * and an async loader's resolve (".then(()=>_(id))"). Narrow on purpose: a
 * number a function of the code's own takes ("_(200)") is code, and stays.
 */
const ID_CALL = new RegExp(String.raw`((?<![A-Za-z0-9_$])_\._\(|\.then\(\(\)=>_\()${ID}\)`, "g")
/** The runtime's list of the modules it runs first. */
const RUNTIME_IDS = new RegExp(String.raw`runtimeModuleIds:\[${ID}(?:,${ID})*\]`, "g")
/** A build id shorter than this is never masked, so it can't take code with it. */
const MIN_BUILD_ID = 6

/**
 * Masks what the chunker picks rather than the code: every chunk name (a lazy
 * loader lists its scripts and styles by content hash) and how many a loader
 * lists (a lazy group's chunk count), and every one- or two-character name.
 * Both builds are masked alike, so only code moves the result.
 * @param {string} text
 * @returns {string}
 */
export function maskNames(text) {
  return text.replace(CHUNK_NAME, "static/chunks/C.js").replace(CHUNK_LIST, "$1static/chunks/C.js$1").replace(SHORT_NAME, "_")
}

/**
 * Masks what the build numbers rather than the code (V-172): every module id
 * code names (ID_CALL, RUNTIME_IDS), on text maskNames already masked. Both
 * builds are masked alike, so a module renumbered between them reads the same.
 * @param {string} text
 * @returns {string}
 */
export function maskIds(text) {
  return text.replace(ID_CALL, "$1I)").replace(RUNTIME_IDS, (ids) => ids.replace(new RegExp(ID, "g"), "I"))
}

/** A chunk's source with the build's id masked, before anything else is, so maskNames can't split it first. */
const maskBuildId = (src, buildId) => (buildId.length >= MIN_BUILD_ID ? src.split(buildId).join("BUILD_ID") : src)

/** Of two texts for one module id, the one kept: the least, so the order chunks are read in can't choose. */
const keep = (mods, id, text) => {
  const had = mods.get(id)
  if (had === undefined || text < had) mods.set(id, text)
}

/**
 * A Turbopack chunk's modules: a Map from each id to its masked text,
 * "<id>,<factory>", cut after the factory's last "}" so the chunk's closing
 * never joins its last module. A chunk with no module ids (the runtime) comes
 * back whole and masked, as `rest`.
 * @param {string} src
 * @returns {{ mods: Map<string, string>, rest: string | null }}
 */
export function chunkModules(src) {
  const at = [...src.matchAll(MODULE)].map((m) => ({ id: m[1], from: m.index + 1 }))
  const mods = new Map()
  if (!at.length) return { mods, rest: maskNames(src) }
  at.forEach(({ id, from }, k) => {
    let seg = src.slice(from, k + 1 < at.length ? at[k + 1].from - 1 : src.length)
    if (k + 1 === at.length) {
      const close = seg.lastIndexOf("])")
      if (close >= 0 && CLOSING.test(seg.slice(close))) seg = seg.slice(0, close)
    }
    const end = seg.lastIndexOf("}")
    keep(mods, id, maskNames(end >= 0 ? seg.slice(0, end + 1) : seg))
  })
  return { mods, rest: null }
}

/**
 * Each route's first-load bytes in the build at `next`: a Map from its page
 * file to { shipped, canon, modules, hash }. Shipped is routes.mjs's number;
 * canon is the canonical gzip -9 bytes of the same chunks; hash is the
 * canonical text's sha256 (12 hex), equal in two builds only when the route's
 * code is. The build's id comes from its BUILD_ID file, when it has one.
 * @param {string} [next]
 * @returns {Map<string, { shipped: number, canon: number, modules: number, hash: string }>}
 */
export function canonicalWeights(next = ".next") {
  if (!existsSync(join(next, "build-manifest.json"))) throw new Error(`not a build: ${next} (no build-manifest.json)`)
  const idFile = join(next, "BUILD_ID")
  const buildId = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : ""
  const parsed = new Map()
  const parse = (f) => {
    if (!parsed.has(f)) {
      const p = join(next, f)
      parsed.set(f, chunkModules(maskBuildId(existsSync(p) ? readFileSync(p, "utf8") : "", buildId)))
    }
    return parsed.get(f)
  }
  const out = new Map()
  for (const [route, { bytes, chunks }] of routeWeights(next)) {
    const mods = new Map()
    const rest = []
    for (const f of chunks) {
      const c = parse(f)
      for (const [id, text] of c.mods) keep(mods, id, text)
      if (c.rest !== null) rest.push(c.rest)
    }
    // Each module's own id off ("<id>,<factory>" keeps its ","), the ids it names masked, sorted by what is left.
    const texts = [...mods].map(([id, t]) => maskIds(t.slice(id.length))).sort()
    const text = `${texts.join("\n")}\n${rest.map(maskIds).sort().join("\n")}`
    out.set(route, {
      shipped: bytes,
      canon: gzipSync(text, { level: 9 }).length,
      modules: mods.size,
      hash: createHash("sha256").update(text).digest("hex").slice(0, 12),
    })
  }
  return out
}

/**
 * A route's verdict from its shipped and canonical deltas, in gzip bytes.
 * @param {number} shipped
 * @param {number} canonical
 * @returns {"REAL" | "RE-CUT" | "same"}
 */
export function verdict(shipped, canonical) {
  if (Math.abs(canonical) > BAND) return "REAL"
  return Math.abs(shipped) > BAND ? "RE-CUT" : "same"
}

/**
 * What the change from `before` to `after` did to every route either build
 * has: one row per page file, sorted, and a tally by verdict.
 * @param {string} before
 * @param {string} after
 */
export function canonDiff(before, after) {
  const a = canonicalWeights(before)
  const b = canonicalWeights(after)
  const tally = { REAL: 0, "RE-CUT": 0, same: 0, NEW: 0, GONE: 0 }
  const rows = [...new Set([...a.keys(), ...b.keys()])].sort().map((route) => {
    const x = a.get(route)
    const y = b.get(route)
    /** @param {"shipped" | "canon"} k */
    const pair = (k) => ({ before: x ? x[k] : null, after: y ? y[k] : null, delta: (y ? y[k] : 0) - (x ? x[k] : 0) })
    /** @type {"REAL" | "RE-CUT" | "same" | "NEW" | "GONE"} */
    const v = !x ? "NEW" : !y ? "GONE" : verdict(y.shipped - x.shipped, y.canon - x.canon)
    tally[v]++
    return {
      route,
      verdict: v,
      shipped: pair("shipped"),
      canonical: { ...pair("canon"), same: Boolean(x && y && x.hash === y.hash) },
      modules: { before: x ? x.modules : null, after: y ? y.modules : null },
    }
  })
  return { band: BAND, tally, rows }
}

const signed = (n) => `${n >= 0 ? "+" : ""}${n}`

/**
 * The summary line: routes, then how many of each verdict.
 * @param {ReturnType<typeof canonDiff>} diff
 */
export function summaryLine({ rows, tally }) {
  const more = ["NEW", "GONE"].filter((k) => tally[k]).map((k) => `, ${tally[k]} ${k}`).join("")
  return `routes ${rows.length}: ${tally.REAL} REAL (canonical outside +/-${BAND} B), ${tally["RE-CUT"]} RE-CUT (shipped moved, canonical within +/-${BAND} B), ${tally.same} same${more}`
}

/**
 * One route's line: its shipped and canonical deltas, its module count in
 * each build, and its verdict last.
 * @param {ReturnType<typeof canonDiff>["rows"][number]} row
 */
export function rowLine({ route, verdict: v, shipped, canonical, modules }) {
  return `  ${route} shipped ${signed(shipped.delta)} canonical ${signed(canonical.delta)} (modules ${modules.before ?? "-"} -> ${modules.after ?? "-"}) ${v}`
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const [before, after] = args.filter((a) => !a.startsWith("--"))
  if (!before || !after) {
    console.error("usage: node scripts/fluidity/canondiff.mjs <before .next> <after .next> [--table | --json]")
    process.exit(2)
  }
  const diff = canonDiff(before, after)
  if (args.includes("--json")) console.log(JSON.stringify(diff))
  else {
    console.log(summaryLine(diff))
    if (args.includes("--table")) for (const row of diff.rows) console.log(rowLine(row))
  }
}
