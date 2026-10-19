// What a file brings with it: the source it reaches by static import, walked
// from the repository's root. A dynamic import() starts a chunk of its own, so
// it isn't followed, and neither is `import type`. The first-load guards
// (app/firstLoad.test.ts, app/app/doc/docFirstLoad.test.ts) and the route
// ceilings (route-ceilings.json) measure source with this one walker; each
// guard had a copy of it.
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/** A static import or re-export's specifier; `import type` is skipped. */
export const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

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
 */
export function walk(entries) {
  const files = new Map(entries.map((e) => [e, null]))
  const packages = []
  const queue = [...entries]
  while (queue.length) {
    const file = queue.shift()
    for (const m of sourceOf(file).matchAll(importRe)) {
      const spec = m[1]
      const next = resolve(spec, file)
      if (next) {
        if (!files.has(next)) {
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
