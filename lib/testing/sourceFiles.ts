import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const TEST = /\.(test|spec)\./

/** Every file under each root whose path `keep` takes, passing over node_modules, dot folders and test-results. */
function walkFiles(roots: string[], keep: (path: string) => boolean): string[] {
  const out: string[] = []
  const walk = (path: string) => {
    if (statSync(path).isFile()) {
      if (keep(path)) out.push(path)
      return
    }
    for (const e of readdirSync(path, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "test-results" || e.name.startsWith(".")) continue
      walk(path === "." ? e.name : join(path, e.name))
    }
  }
  roots.forEach(walk)
  return out
}

/**
 * The source files under each root (a folder or a file, from the repo's
 * root), as repo paths: the one walk the guards read the source by. Tests and
 * specs are passed over, since a guard reads what ships, and so are
 * node_modules, dot folders (.next) and test-results. A root that isn't there
 * throws, so a misspelt folder can't pass a guard empty.
 */
export function sourceFiles(roots: string[], ext: RegExp): string[] {
  return walkFiles(roots, (path) => ext.test(path) && !TEST.test(path))
}

/** The tests and specs under each root, by the same walk: for a guard on how tests are written. */
export function testFiles(roots: string[], ext: RegExp): string[] {
  return walkFiles(roots, (path) => ext.test(path) && TEST.test(path))
}
