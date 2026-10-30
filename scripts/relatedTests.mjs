#!/usr/bin/env node
// The light check's unit tests for a change (V-96): `vitest related` on every
// changed file, and beside them every test that reads a changed file by path.
// A readFileSync("app/phone.css") is no import, so the module graph never links
// that test to the file, and `vitest related app/phone.css` ran none of them:
// asana-12 (a)'s phone.css change was green in its light check and broke three
// tests only in the full gate. The same holds for any file that isn't a module
// (a stylesheet, a locale's JSON, a notices text, an SVG).
//
// A test reads such a file when its source names it (app/phone.css,
// join(__dirname, "globals.css"), "../../app/interaction.css": the file name is
// in all of them), and a stylesheet also when the test walks the tree for every
// one (readdirSync or a glob, and ".css"). A deleted or renamed file counts: its
// readers are the tests it breaks.
//
// Usage, from the web tree: node scripts/relatedTests.mjs <changed files...>
// (vitest is given those still there; extra vitest flags go after --).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

// The web tree: the script runs from its root (npm scripts, and vitest, do).
const ROOT = process.cwd()
const SKIP = new Set(["node_modules", ".next", "e2e", "dist", "playwright-report", "test-results", ".git"])
const TEST = /\.test\.(ts|tsx|js|mjs)$/
const WALKS = /readdirSync|globSync|\bglob\(/
/** Files the module graph links: a test that imports one is found by vitest related itself. */
const MODULE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

function testFiles(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) testFiles(p, out)
    else if (TEST.test(e.name)) out.push(p)
  }
  return out
}

/** The tests (paths from the web tree's root) that read any of `changed`, deleted ones included, by path. */
export function pathReaders(changed, root = ROOT) {
  const read = changed.filter((f) => !MODULE.test(f))
  const names = [...new Set(read.map((f) => basename(f)))]
  if (names.length === 0) return []
  const css = read.some((f) => f.endsWith(".css"))
  const found = []
  for (const file of testFiles(root)) {
    const src = readFileSync(file, "utf8")
    if (names.some((n) => src.includes(n)) || (css && WALKS.test(src) && src.includes(".css"))) found.push(relative(root, file))
  }
  return found.sort()
}

/** vitest's arguments: related, every changed file still there, and the readers of every changed file. */
export function relatedArgs(changed, root = ROOT) {
  const here = changed.filter((f) => existsSync(join(root, f)))
  return ["related", "--run", ...new Set([...here, ...pathReaders(changed, root)])]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const cut = argv.indexOf("--")
  const files = cut < 0 ? argv : argv.slice(0, cut)
  const extra = cut < 0 ? [] : argv.slice(cut + 1)
  if (files.length === 0) {
    console.error("usage: node scripts/relatedTests.mjs <changed files...> [-- vitest flags]")
    process.exit(2)
  }
  const args = relatedArgs(files)
  const readers = pathReaders(files)
  if (readers.length) console.log(`relatedTests: + ${readers.length} test(s) that read a changed file by path`)
  const run = spawnSync(join(ROOT, "node_modules/.bin/vitest"), [...args, ...extra], { cwd: ROOT, stdio: "inherit" })
  process.exit(run.status ?? 1)
}
