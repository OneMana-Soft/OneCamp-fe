import { posix } from "node:path"
import { ImportType, init, parse } from "es-module-lexer"
import MagicString from "magic-string"
import type { Plugin } from "vitest/config"

// V-138: every app import() feeds the tests' one code wait (lib/testing/lazyCode), in tests only. vitest.config.ts
// compiles app source with this plugin, which hands each dynamic import to the trackLoad that lazyCode puts on
// globalThis:
//   import("./piece")  ->  globalThis.__trackLoad(() => import("./piece"))
// so a findBy or waitFor knows that code is coming however the app loads it (lazyChunk and what's built on it,
// next/dynamic, an import() in an effect or a handler, and any added later), with no warm-up per file. The import()
// keeps its text and its place, a source map keeps every line and column (and the plugin hands Vite's import analysis
// the map it leaves out, so the whole chain keeps them), and it settles as it did. No app build reads vitest.config.ts,
// so no route carries a byte of this.

/** What goes in front of an import(): a name first, so a line before it with no semicolon still ends where it did. */
const TRACK = "globalThis.__trackLoad(() => "

/** The module with each import() handed to trackLoad, and its source map; null when it has none to hand over. */
export async function trackImports(code: string, id: string) {
  if (!/\bimport\s*\(/.test(code)) return null
  await init
  const [imports] = parse(code, id)
  let out: MagicString | undefined
  for (const { t, n, a, d, ss, se } of imports) {
    if (t !== ImportType.Dynamic) continue
    // One whose argument awaits or yields stays as it is: inside a function of its own, the pause would move.
    if ((n === undefined || a !== -1) && /\b(?:await|yield)\b/.test(code.slice(d, se))) continue
    out ??= new MagicString(code)
    out.prependLeft(ss, TRACK)
    out.appendRight(se, ")")
  }
  return out ? { code: out.toString(), map: out.generateMap({ hires: "boundary", source: id, includeContent: true }) } : null
}

/**
 * The source map of what Vite's dev import analysis wrote over `code` to make `out`, which it hands back without one (a
 * build gets one): each import pointed at the module it resolves ("./piece" -> "/components/piece.tsx"), one of a
 * variable through __vite__injectQuery, and imports of its own put in front. Without it every column after a rewritten
 * import is off in a stack. Each import of `code` is matched with its own in `out`, and whatever part of it differs is
 * written over; the map is given only when that makes `out` exactly. null when nothing changed, or something else did.
 */
export async function importAnalysisMap(code: string, out: string, id: string) {
  if (code === out) return null
  await init
  try {
    // import.meta (d -2) isn't an import Vite rewrites.
    const imports = (text: string) => parse(text, id)[0].filter((i) => i.d !== -2)
    const before = imports(code)
    const after = imports(out)
    const front = after.length - before.length // the imports Vite put in front
    if (front < 0) return null
    const lead = before.length > 0 ? after[front].ss - before[0].ss : out.length - code.length
    if (lead < 0) return null
    const rewritten = new MagicString(code)
    if (lead > 0) rewritten.prepend(out.slice(0, lead))
    const writeOver = (start: number, end: number, text: string) => {
      if (code.slice(start, end) === text) return
      if (start === end) rewritten.appendLeft(start, text)
      else if (text === "") rewritten.remove(start, end)
      else rewritten.overwrite(start, end, text)
    }
    before.forEach((was, i) => {
      const now = after[front + i]
      // Its three parts: before the specifier, the specifier (a static one's with its quotes, which Vite writes
      // again; a dynamic one's range has them), and after it.
      const q = was.d === -1 ? 1 : 0
      writeOver(was.ss, was.s - q, out.slice(now.ss, now.s - q))
      writeOver(was.s - q, was.e + q, out.slice(now.s - q, now.e + q))
      writeOver(was.e + q, was.se, out.slice(now.e + q, now.se))
    })
    return rewritten.toString() === out ? rewritten.generateMap({ hires: "boundary", source: id, includeContent: true }) : null
  } catch {
    // Code the lexer can't read, or imports whose parts cross (one inside another's): no map, as Vite gives none.
    return null
  }
}

/**
 * Hands Vite's dev import analysis the source map it leaves out (importAnalysisMap) for the modules in `ids`, so a stack
 * from them keeps every column through the whole chain: this transform's own map keeps them, and that later step would
 * lose them again. Every other module's chain stays as Vite makes it.
 */
function mapImportAnalysis(plugins: readonly Plugin[], ids: ReadonlySet<string>) {
  const analysis = plugins.find((plugin) => plugin.name === "vite:import-analysis")
  const transform = analysis?.transform
  if (!analysis || typeof transform !== "function") return
  analysis.transform = async function (code, id, options) {
    const result = await transform.call(this, code, id, options)
    if (!ids.has(id) || !result || typeof result !== "object" || result.map || typeof result.code !== "string") return result
    const map = await importAnalysisMap(code, result.code, id)
    return map ? { ...result, map } : result
  }
}

const SCRIPT = /\.[cm]?[jt]sx?$/
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/
/** Top folders that aren't app source: the browser tests, the repo's node scripts, and files served as they are. */
const NOT_APP = new Set(["e2e", "scripts", "public"])

/**
 * Whether the module `id` is app source, whose import()s the tests' code wait should know: a script under `root`,
 * outside node_modules, dot folders (.next), e2e/, scripts/, public/ and lib/testing/ (the tests' own helpers), and not
 * a test, a spec or one of vitest's `setupFiles` (from the root). testdata/lazyCode is app code written for
 * lib/testing's own tests, so it counts.
 */
export function isAppSource(id: string, root: string, setupFiles: readonly string[] = []): boolean {
  const file = id.split("?", 1)[0]
  if (file.startsWith("\0") || !SCRIPT.test(file) || TEST.test(file)) return false
  const path = posix.relative(root, file)
  if (path.startsWith("../") || posix.isAbsolute(path)) return false
  const parts = path.split("/")
  if (parts.some((part) => part === "node_modules" || part.startsWith("."))) return false
  if (NOT_APP.has(parts[0]) || (parts[0] === "lib" && parts[1] === "testing")) return false
  return !setupFiles.some((setup) => posix.resolve(root, setup) === file)
}

/** The plugin vitest.config.ts compiles app source with: tests only, never an app build. */
export function trackImportsPlugin({ setupFiles = [] }: { setupFiles?: readonly string[] } = {}): Plugin {
  let root = process.cwd()
  // The modules this transform wrote over: their import analysis gets its source map (mapImportAnalysis).
  const changed = new Set<string>()
  return {
    name: "lazy-code:track-imports",
    configResolved(config) {
      root = config.root
      mapImportAnalysis(config.plugins, changed)
    },
    async transform(code, id) {
      const out = isAppSource(id, root, setupFiles) ? await trackImports(code, id) : null
      if (out) changed.add(id)
      return out
    },
  }
}
