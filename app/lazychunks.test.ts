import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { afterAll, describe, expect, it } from "vitest"
import { lazyDiff, lazyWeights, rowLine, summaryLines } from "../scripts/fluidity/lazychunks.mjs"

// A route's lazy scripts are the chunks its dynamic imports can load after its first load, read from the build and
// never from what the chunks contain (V-896, 11 Nov 2026: a size table counted lazy chunks by content markers and
// missed the two that one new dynamic import was cut into: +23,352 raw / +8,541 gz read, +35,875 / +14,119 true).
// Two ways in: the route's react-loadable-manifest.json (next/dynamic), and a lazy loader's list of the scripts it
// fetches (an import() or lazyChunk() the manifest never lists), in the first load or in a lazy chunk. Built in a
// folder of its own.
const dir = mkdtempSync(path.join(tmpdir(), "lazychunks-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A Turbopack chunk holding one module. */
const chunk = (id: number, code: string) =>
  `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,${id},e=>{"use strict";${code}}]);`
/** A lazy loader's code: the scripts and styles it fetches, then the module it runs. */
const loads = (...files: string[]) =>
  `e.v(t=>Promise.all([${files.map((f) => `"static/chunks/${f}"`).join(",")}].map(t=>e.l(t))).then(()=>t(918273)));`

type Route = { first: string[]; manifest?: string[][] }
/** Writes a build the way lazychunks.mjs reads one: manifests, chunks, each route's react-loadable-manifest.json. */
const build = (name: string, chunks: Record<string, string>, routes: Record<string, Route>) => {
  const next = path.join(dir, name)
  const put = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(next, rel)), { recursive: true })
    writeFileSync(path.join(next, rel), text)
  }
  put("build-manifest.json", JSON.stringify({ rootMainFiles: ["/static/chunks/runtime.js"] }))
  put("static/chunks/runtime.js", "(()=>{globalThis.TURBOPACK=[]})();")
  for (const [file, text] of Object.entries(chunks)) put(`static/chunks/${file}`, text)
  for (const [route, { first, manifest }] of Object.entries(routes)) {
    const entryJSFiles = { [`[project]/app/${route}/page`]: first.map((f) => `/static/chunks/${f}`) }
    put(
      `server/app/${route}/page_client-reference-manifest.js`,
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {}; globalThis.__RSC_MANIFEST["/${route}/page"] = ${JSON.stringify({ entryJSFiles })}`,
    )
    if (manifest) {
      const entries = manifest.map((files, i) => [String(500100 + i), { id: 500100 + i, files: files.map((f) => `static/chunks/${f}`) }])
      put(`server/app/${route}/page/react-loadable-manifest.json`, JSON.stringify(Object.fromEntries(entries)))
    }
  }
  return next
}
/** Files' weight, each alone: [raw, gzip -9, files]. */
const weight = (next: string, ...files: string[]) =>
  files.reduce(
    (w, f) => {
      const b = readFileSync(path.join(next, "static/chunks", f))
      return [w[0] + b.length, w[1] + gzipSync(b, { level: 9 }).length, w[2] + 1]
    },
    [0, 0, 0],
  )

// The task page's first load holds a lazyChunk() loader for the tooltip's chip; its manifest lists one dynamic
// import cut into two chunks (neither says what it is), and a file the build doesn't hold. The panel's own loader
// fetches a deeper chunk and a style. The board page has a lazy chunk of its own.
const chunks = {
  "task.js": chunk(101, `let a="Tasks";${loads("chip.js")}`),
  "panel.js": chunk(201, `let x=()=>"Effects";${loads("deep.js", "panel.css")}`),
  "panel2.js": chunk(202, `let y=()=>"Describe a scene";`),
  "chip.js": chunk(301, `let z="chip";`),
  "deep.js": chunk(401, `let d="deep";`),
  "panel.css": `.panel{display:grid}`,
  "board.js": chunk(102, `let b="Board";${loads("boardLazy.js")}`),
  "boardLazy.js": chunk(501, `let l="lanes";`),
}
const routes = {
  task: { first: ["task.js"], manifest: [["panel.js", "panel2.js", "task.js"], ["gone.js"]] },
  board: { first: ["board.js"] },
}
const A = build("before", chunks, routes)
// After: the panel's loader also fetches a new composer chunk, which carries no marker of what it is.
const B = build(
  "after",
  { ...chunks, "panel.js": chunk(201, `let x=()=>"Effects";${loads("deep.js", "composer.js", "panel.css")}`), "composer.js": chunk(601, `let c=()=>"Make one";`) },
  routes,
)

describe("a route's lazy scripts", () => {
  const task = lazyWeights(A).routes.get("app/task/page.tsx")

  it("are every script its react-loadable-manifest.json lists beyond its first load, whatever they contain", () => {
    expect(task?.manifest).toEqual(weight(A, "panel.js", "panel2.js"))
    expect(task?.dynamicImports).toBe(2)
  })

  it("follow every lazy loader the manifest never lists: an import() in the first load, and a lazy chunk's own", () => {
    expect(task?.chunks).toEqual(["static/chunks/chip.js", "static/chunks/deep.js", "static/chunks/panel.js", "static/chunks/panel2.js"])
    expect(task?.lazy).toEqual(weight(A, "chip.js", "deep.js", "panel.js", "panel2.js"))
  })

  it("never count the first load, a style, or a file the build doesn't hold, which they count as missing", () => {
    expect(task?.first).toEqual(weight(A, "runtime.js", "task.js"))
    expect(task?.chunks.some((c: string) => c.endsWith("task.js") || c.endsWith(".css"))).toBe(false)
    expect(task?.missing).toBe(1)
  })

  it("are each route's own", () => {
    expect(lazyWeights(A).routes.get("app/board/page.tsx")?.chunks).toEqual(["static/chunks/boardLazy.js"])
  })
})

describe("the change between two builds", () => {
  it("moves a route's lazy scripts by a new chunk no marker names, and no other route's", () => {
    const diff = lazyDiff(A, B)
    const task = diff.rows.find((r) => r.route === "app/task/page.tsx")
    const grew = weight(B, "chip.js", "composer.js", "deep.js", "panel.js", "panel2.js")
    const was = weight(A, "chip.js", "deep.js", "panel.js", "panel2.js")
    expect(task?.lazy.delta).toEqual([grew[0] - was[0], grew[1] - was[1], 1])
    expect(task?.gained).toEqual(["static/chunks/composer.js"])
    expect(task?.manifest.delta[2]).toBe(0)
    expect(task?.verdict).toBe("moved")
    expect(diff.rows.find((r) => r.route === "app/board/page.tsx")?.verdict).toBe("same")
    expect(summaryLines(diff)[0]).toBe(
      `routes 2: lazy scripts moved on 1 (raw +${grew[0] - was[0]}..+${grew[0] - was[0]}, gz +${grew[1] - was[1]}..+${grew[1] - was[1]}), 1 same`,
    )
    expect(rowLine(task as (typeof diff.rows)[number])).toMatch(/^ {2}app\/task\/page\.tsx lazy raw \+\d+ gz \+\d+ \(files 4 -> 5\) manifest raw \+\d+ gz [+-]\d+ \(files 2 -> 2\) first raw \+0 gz \+0 \(files 2 -> 2\) chunks \+1 -0 moved$/)
  })
})

describe("the command", () => {
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/fluidity/lazychunks.mjs")
  it("prints the summary and the whole folder, then every route with --table", () => {
    const out = execFileSync(process.execPath, [tool, A, B, "--table"], { encoding: "utf8" }).trim().split("\n")
    expect(out[0]).toMatch(/^routes 2: lazy scripts moved on 1 /)
    expect(out[1]).toMatch(/^static\/chunks js raw \d+ -> \d+ \(\+\d+\) gz \d+ -> \d+ \(\+\d+\) files 8 -> 9$/)
    expect(out.slice(-2).map((l) => l.trim().split(" ")[0])).toEqual(["app/board/page.tsx", "app/task/page.tsx"])
  })
  it("prints one build's routes, or only those --route names", () => {
    const out = execFileSync(process.execPath, [tool, A, "--route", "task"], { encoding: "utf8" }).trim().split("\n")
    expect(out.filter((l) => l.startsWith("  "))).toHaveLength(1)
    expect(out.at(-1)).toMatch(/^ {2}app\/task\/page\.tsx first raw \d+ gz \d+ files 2 lazy raw \d+ gz \d+ files 4 manifest raw \d+ gz \d+ files 2 \(dynamic imports 2, missing 1\)$/)
  })
})
