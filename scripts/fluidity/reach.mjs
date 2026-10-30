// What a file brings with it: the source it reaches by static import, walked
// from the repository's root. A dynamic import() starts a chunk of its own, so
// it isn't followed unless a walk asks (what a page draws under its providers),
// and `import type` never is. The first-load guards
// (app/firstLoad.test.ts, app/app/doc/docFirstLoad.test.ts) and the route
// ceilings (route-ceilings.json) measure source with this one walker; each
// guard had a copy of it.
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/** A static import or re-export's specifier; `import type` is skipped. */
export const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

/** A literal dynamic import()'s specifier. */
export const dynamicImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const sources = new Map()
/** A file's source with its comments taken out (a commented-out import brings nothing). */
export function sourceOf(file) {
  let s = sources.get(file)
  if (s === undefined) {
    s = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    sources.set(file, s)
  }
  return s
}

/** The repository file an import of `spec` from `from` means, or null for a package. */
export function resolve(spec, from) {
  let base
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && !c.endsWith("/") && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

/** The package an import names, or null for a file of ours ("@radix-ui/react-dialog", "swr"). */
export function packageOf(spec) {
  if (spec.startsWith(".") || spec.startsWith("@/")) return null
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
}

/**
 * Every file `entries` reach by static import, each with the file that first
 * brought it (null for an entry), and every package specifier with its
 * importer: `{ files: Map<file, parent>, packages: Array<[spec, file]> }`.
 * With `dynamic`, a literal import("...") is followed too: a chunk fetched later
 * still draws under the page's providers. An import that `follow(file,
 * importer)` refuses is left out, with everything it brings.
 * @param {string[]} entries
 * @param {{ dynamic?: boolean, follow?: (file: string, importer: string) => boolean }} [options]
 */
export function walk(entries, { dynamic = false, follow = () => true } = {}) {
  const files = new Map(entries.map((e) => [e, null]))
  const packages = []
  const queue = [...entries]
  while (queue.length) {
    const file = queue.shift()
    const source = sourceOf(file)
    const specs = [...source.matchAll(importRe)].map((m) => m[1])
    if (dynamic) specs.push(...[...source.matchAll(dynamicImportRe)].map((m) => m[1]))
    for (const spec of specs) {
      const next = resolve(spec, file)
      if (next) {
        if (!files.has(next) && follow(next, file)) {
          files.set(next, file)
          queue.push(next)
        }
      } else if (packageOf(spec)) packages.push([spec, file])
    }
  }
  return { files, packages }
}

/** The files `entries` reach, each with the file that brought it. */
export function reach(entries) {
  return walk(Array.isArray(entries) ? entries : [entries]).files
}

/** The App Router's files that load with a page from its folder and each folder above it (never metadata). */
export const ROUTE_SEGMENTS = ["layout", "template", "not-found", "global-error", "error", "loading"]

/**
 * A route's entries: its page, then every layout and boundary in the page's
 * folder and each folder above it, up to `appDir` (V-49). They all ship with
 * the page, so a route's source line is theirs, not the page's alone.
 */
export function routeEntries(page, appDir = "app") {
  const folders = path.dirname(page).split(path.sep)
  const out = [page]
  for (let i = appDir.split(path.sep).length; i <= folders.length; i++) {
    for (const name of ROUTE_SEGMENTS) {
      for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
        const file = [...folders.slice(0, i), name + ext].join(path.sep)
        if (existsSync(file)) out.push(file)
      }
    }
  }
  return out
}

/** What a route reaches: its page with every layout and boundary above it, once each (routeEntries). */
export function routeReach(page, appDir = "app") {
  return reach(routeEntries(page, appDir))
}

/**
 * The shared shell's folders, under `appDir`: the root layout's and the
 * signed-in layout's. Their layouts and boundaries ship on every page below
 * them, so they belong to every first screen alike: the shell's own guards
 * hold them, and a page's route line counts them (routeEntries).
 */
export const SHELL_FOLDERS = ["", "app"]

/** A page of the App Router: "<folder>/page.tsx" (or .ts, .jsx, .js). */
const PAGE_FILE = /(?:^|[\\/])page\.[jt]sx?$/

/** Whether `file` is a page (PAGE_FILE): the one page test for every walker and measure. */
export const isPageFile = (file) => PAGE_FILE.test(file)

/**
 * The entries of a first screen (CR-79's ruling on V-49, 29 Oct 2026): a page
 * with the layouts and boundaries of its route beyond the shell, that is, of
 * its own folders below SHELL_FOLDERS; any other file alone. Walked from the
 * page alone, a guard missed what the page's own layout brings; walked from
 * the whole route, it flagged the shell's files on every page. A move into
 * the shell is caught by the route lines, which keep it.
 */
export function firstScreenEntries(entries, appDir = "app") {
  const shell = new Set(SHELL_FOLDERS.map((f) => path.join(appDir, f)))
  return (Array.isArray(entries) ? entries : [entries]).flatMap((e) =>
    isPageFile(e) ? routeEntries(e, appDir).filter((f) => f === e || !shell.has(path.dirname(f))) : [e],
  )
}

/** What a first screen reaches (firstScreenEntries), each file with the file that brought it. */
export function firstScreen(entries, appDir = "app") {
  return reach(firstScreenEntries(entries, appDir))
}

/** How `file` was reached: "file <- importer <- ... <- entry". */
export function chainOf(files, file) {
  const out = []
  for (let f = file; f; f = files.get(f) ?? null) out.push(f)
  return out.join(" <- ")
}

/** Bytes of source in `files` (a reach), leaving out any in `except`. */
const sizes = new Map()
export function sourceBytes(files, except = null) {
  let bytes = 0
  for (const f of files.keys()) {
    if (except && except.has(f)) continue
    let n = sizes.get(f)
    if (n === undefined) sizes.set(f, (n = statSync(f).size))
    bytes += n
  }
  return bytes
}
