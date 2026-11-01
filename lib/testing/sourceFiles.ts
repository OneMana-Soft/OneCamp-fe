import { readFileSync, readdirSync, statSync } from "node:fs"
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

/**
 * Where `text` first stands in the file at `path` (from the repo's root), as a stack names a place:
 * "path:line:column", both from 1. A text the file doesn't have throws, so a test can't look for no place.
 */
export function placeIn(path: string, text: string): string {
  const lines = readFileSync(path, "utf8").split("\n")
  const line = lines.findIndex((each) => each.includes(text))
  if (line < 0) throw new Error(`${path} has no ${JSON.stringify(text)}`)
  return `${path}:${line + 1}:${lines[line].indexOf(text) + 1}`
}
