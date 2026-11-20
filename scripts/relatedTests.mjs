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
// V-1024: source is read by path too. A guard that reads the source
// (instantSaveGuard walks components/ for every .tsx and checks how each one
// saves; drawerPrimitive reads every overlay; personHue walks app, components,
// hooks and lib through lib/testing/sourceFiles) imports none of what it reads,
// so `vitest related components/x/Card.tsx` never ran it: gcal-14's web change
// shipped two red guards through two light checks and a review. So whenever a
// module changed, the light check also runs every test that reads the source by
// path: one that reads files (node:fs, a glob, or the shared walk in
// lib/testing/sourceFiles) and either names a changed file, or walks the tree
// for .ts/.tsx files (a walk takes in a new or moved file too), or walks it
// through sourceFiles. A change with no module in it selects as it did before.
//
// V-1032: two more shapes of reader. A test that lists a folder's entries
// (appSegments lists the route folders under app/app, styleDialects the board's
// folders under components/kanbanComponents) names a folder, not a file, and
// asks for no .ts/.tsx; and a test that builds a module's file name from parts
// (`${base}.tsx` while it follows an import chain, `components/drawers/${file}.tsx`)
// never holds the changed file's whole name. So a test that walks also runs
// when a changed module lies in a folder its source spells out (any other file
// too, unless the walk asks for .ts/.tsx: then it sees only source), and a test
// that reads the source runs on any module change when it builds a .ts or .tsx
// name from parts (the name it builds may be the changed one).
//
// Usage, from the web tree: node scripts/relatedTests.mjs <changed files...>
// (vitest is given those still there; extra vitest flags go after --).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, posix, relative, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

// The web tree: the script runs from its root (npm scripts, and vitest, do).
const ROOT = process.cwd()
const SKIP = new Set(["node_modules", ".next", "e2e", "dist", "playwright-report", "test-results", ".git"])
const TEST = /\.test\.(ts|tsx|js|mjs)$/
const WALKS = /readdirSync|globSync|\bglob\(/
/** Files the module graph links: a test that imports one is found by vitest related itself. */
const MODULE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
/** A test reads files by path: node:fs, a glob, or the guards' shared walk (lib/testing/sourceFiles). */
const READS = /readFileSync|readdirSync|globSync|\bglob\(|fs\.promises|fs\/promises|\bsourceFiles\b/
/** A .ts or .tsx file pattern: ".tsx", /\.tsx?$/, /\.(tsx?|css)$/, /\.[jt]sx?$/. */
const TS = /\.tsx?\b|\.\([^)]*\btsx?\b|\.\[[a-z]*t[a-z]*\]sx?/
/** A .ts or .tsx file name built from parts: `${base}.tsx`, `components/drawers/${file}.tsx`. */
const BUILT = /\$\{[^}]*\}\.tsx?\b/
/** A path spelled in parts by one call: join(__dirname, "..", "app", "app"), resolve(ROOT, "components/x"). */
const PARTS = /\b(?:join|resolve)\(((?:[^()]|\([^()]*\))*)\)/g
/** A plain string on one line, with no template expression in it. */
const PLAIN = /(["'`])([^"'`$\n]*)\1/g

/**
 * The folders (paths from the web tree's root) a test's source spells out: each plain string, and
 * the plain parts of each join or resolve call, that make a path with no file extension. Parts
 * after __dirname start from the test's own folder, any other from the root; a glob ends at its
 * first pattern. A folder walker lists what is in the folder it names, so a file added, deleted
 * or moved inside one changes what it sees.
 */
function namedFolders(src, file, root) {
  const here = relative(root, dirname(file)).split(sep).join("/")
  const folders = new Set()
  const add = (from, parts) => {
    const segs = posix.join(from, ...parts).split("/")
    const glob = segs.findIndex((s) => /[*?{]/.test(s))
    const path = (glob < 0 ? segs : segs.slice(0, glob)).join("/")
    if (path && path !== "." && !path.startsWith("..") && !/\s/.test(path) && !/\.\w+$/.test(basename(path))) folders.add(path)
  }
  const rest = src.replace(PARTS, (_, args) => {
    add(/^\s*(?:__dirname|import\.meta\.dirname)\b/.test(args) ? here : "", [...args.matchAll(PLAIN)].map((m) => m[2]))
    return " "
  })
  for (const [, , s] of rest.matchAll(PLAIN)) add("", [s])
  return [...folders]
}

/** Whether a test that walks names a folder any of `files` lies in. */
function walksInto(src, file, files, root) {
  if (!WALKS.test(src)) return false
  const folders = namedFolders(src, file, root)
  return files.some((f) => folders.some((d) => f.startsWith(`${d}/`)))
}

function testFiles(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) testFiles(p, out)
    else if (TEST.test(e.name)) out.push(p)
  }
  return out
}

/**
 * The tests (paths from the web tree's root) that read any of `changed`, deleted ones included, by
 * path: each names a changed file, or walks for every stylesheet, or lists a folder one lies in
 * and asks for no .ts/.tsx (a walk for source never sees a stylesheet or a data file).
 */
export function pathReaders(changed, root = ROOT) {
  const read = changed.filter((f) => !MODULE.test(f))
  const names = [...new Set(read.map((f) => basename(f)))]
  if (names.length === 0) return []
  const css = read.some((f) => f.endsWith(".css"))
  const found = []
  for (const file of testFiles(root)) {
    const src = readFileSync(file, "utf8")
    if (names.some((n) => src.includes(n)) || (css && WALKS.test(src) && src.includes(".css")) || (!TS.test(src) && walksInto(src, file, read, root))) found.push(relative(root, file))
  }
  return found.sort()
}

/**
 * The tests (paths from the web tree's root) that read the source by path, when any of `changed`
 * (deleted ones included) is a module: each reads files and names a changed file, or walks the
 * tree for .ts/.tsx files, or walks it through sourceFiles, or lists a folder a changed module lies
 * in, or builds a .ts/.tsx name from parts. No module changed, none.
 */
export function sourceReaders(changed, root = ROOT) {
  const modules = changed.filter((f) => MODULE.test(f))
  if (modules.length === 0) return []
  const names = [...new Set(modules.map((f) => basename(f)))]
  const found = []
  for (const file of testFiles(root)) {
    const src = readFileSync(file, "utf8")
    if (!READS.test(src)) continue
    if (
      names.some((n) => src.includes(n)) ||
      (WALKS.test(src) && TS.test(src)) ||
      /\bsourceFiles\b/.test(src) ||
      BUILT.test(src) ||
      walksInto(src, file, modules, root)
    )
      found.push(relative(root, file))
  }
  return found.sort()
}

/** vitest's arguments: related, every changed file still there, and the readers of every changed file. */
export function relatedArgs(changed, root = ROOT, readers = [...pathReaders(changed, root), ...sourceReaders(changed, root)]) {
  const here = changed.filter((f) => existsSync(join(root, f)))
  return ["related", "--run", ...new Set([...here, ...readers])]
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
  const readers = pathReaders(files)
  const sources = sourceReaders(files)
  const args = relatedArgs(files, ROOT, [...readers, ...sources])
  if (readers.length) console.log(`relatedTests: + ${readers.length} test(s) that read a changed file by path`)
  if (sources.length) console.log(`relatedTests: + ${sources.length} test(s) that read the source by path (V-1024)`)
  const run = spawnSync(join(ROOT, "node_modules/.bin/vitest"), [...args, ...extra], { cwd: ROOT, stdio: "inherit" })
  process.exit(run.status ?? 1)
}
