import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { duplicateModules } from "../scripts/fluidity/routes.mjs"

// A first load never carries one module twice (FLUIDITY-12, 5 Nov 2026). Turbopack merges each chunk group's
// modules on its own, and a page's HTML lists several groups at once: its layouts, its page, and the root
// not-found and global-error boundaries. A module two of those groups share can land in a different merged chunk
// in each, and the route then downloads it twice. On web beta 0a0310bcf, 91 of 93 routes carried up to 40 ids twice
// (74 of them the same 39; ~52 KB raw of copies on /app): the root 404's view against the /app layout's chunks,
// the in-shell 404's against each page's, and the doc skeleton between its loading boundary and its page.
// routes.mjs --check, which the integrator's full gate runs on its build, fails on any such id, so a head that
// brings them back is stopped.
// Built in a folder of its own.

const dir = mkdtempSync(path.join(tmpdir(), "dupmods-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A Turbopack chunk: its script, then each factory: one module's, or several merged (each export under its id). */
const chunk = (...ids: (number | number[])[]) =>
  `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,${ids
    .map((id) =>
      Array.isArray(id) ? `${id.join(",")},e=>{${id.map((one) => `e.s(["m${one}",()=>${one}],${one})`).join(";")}}` : `${id},e=>{e.s(["m${id}",()=>${id}])}`,
    )
    .join(",")}]);`

/** Writes a build the way routes.mjs reads one, plus a ceiling table that every route meets; returns both paths. */
const build = (name: string, chunks: Record<string, (number | number[])[]>, routes: Record<string, Record<string, string[]>>) => {
  const next = path.join(dir, name)
  const put = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(next, rel)), { recursive: true })
    writeFileSync(path.join(next, rel), text)
  }
  put("build-manifest.json", JSON.stringify({ rootMainFiles: ["/static/chunks/runtime.js"] }))
  put("static/chunks/runtime.js", "(()=>{globalThis.TURBOPACK=[]})();")
  for (const [file, ids] of Object.entries(chunks)) put(`static/chunks/${file}.js`, chunk(...ids))
  for (const [route, segments] of Object.entries(routes)) {
    const entryJSFiles = Object.fromEntries(Object.entries(segments).map(([at, files]) => [at, files.map((f) => `/static/chunks/${f}.js`)]))
    put(
      `server/app/${route}/page_client-reference-manifest.js`,
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {}; globalThis.__RSC_MANIFEST["/${route}/page"] = ${JSON.stringify({ entryJSFiles })}`,
    )
  }
  const budgets = path.join(dir, `${name}-ceilings.json`)
  writeFileSync(budgets, JSON.stringify({ routes: Object.fromEntries(Object.keys(routes).map((r) => [`app/${r}/page.tsx`, { gzipKB: 1 }])) }))
  return { next, budgets }
}

// Every route's HTML lists the root layout, the root not-found and the page. The not-found view and the task
// page share 202 (the 404's card): in "twice" each group merged it into a chunk of its own; in "once" the
// not-found group found it available from the root layout, as the board page's own modules are.
const twice = build(
  "twice",
  { layout: [101], notFound: [201, 202], task: [202, 301], board: [302] },
  {
    task: { "[project]/app/layout": ["layout"], "[project]/app/not-found": ["layout", "notFound"], "[project]/app/task/page": ["layout", "task"] },
    board: { "[project]/app/layout": ["layout"], "[project]/app/not-found": ["layout", "notFound"], "[project]/app/board/page": ["layout", "board"] },
  },
)
const once = build(
  "once",
  { layout: [101, 202], notFound: [201], task: [301], board: [302] },
  {
    task: { "[project]/app/layout": ["layout"], "[project]/app/not-found": ["layout", "notFound"], "[project]/app/task/page": ["layout", "task"] },
    board: { "[project]/app/layout": ["layout"], "[project]/app/not-found": ["layout", "notFound"], "[project]/app/board/page": ["layout", "board"] },
  },
)

describe("a route's duplicated modules", () => {
  it("are the module ids its first load carries in two chunks, with those chunks", () => {
    const d = duplicateModules(twice.next)
    expect(d.get("app/task/page.tsx")).toEqual([{ id: "202", chunks: ["static/chunks/notFound.js", "static/chunks/task.js"] }])
    expect(d.get("app/board/page.tsx")).toEqual([])
  })
  it("count a module Turbopack merged into another factory under its own id: merged in one chunk, alone in the next", () => {
    // The not-found group hoisted the 404's card (202) into its own module (201); the task page's chunk holds it alone.
    const hoisted = build(
      "hoisted",
      { layout: [101], notFound: [[202, 201]], task: [202, 301] },
      { task: { "[project]/app/layout": ["layout"], "[project]/app/not-found": ["layout", "notFound"], "[project]/app/task/page": ["layout", "task"] } },
    )
    expect(duplicateModules(hoisted.next).get("app/task/page.tsx")).toEqual([{ id: "202", chunks: ["static/chunks/notFound.js", "static/chunks/task.js"] }])
  })
  it("are none when every module is in one chunk, a chunk two segments list included", () => {
    expect([...duplicateModules(once.next).values()].flat()).toEqual([])
  })
})

describe("the route check", () => {
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/fluidity/routes.mjs")
  const check = ({ next, budgets }: { next: string; budgets: string }) =>
    spawnSync(process.execPath, [tool, "--check", "--next", next, "--budgets", budgets], { encoding: "utf8" })
  it("fails on a first load that carries a module twice, naming the route, the id and its chunks", () => {
    const run = check(twice)
    expect(run.status).toBe(1)
    expect(run.stdout).toContain("app/task/page.tsx: module 202 in static/chunks/notFound.js, static/chunks/task.js")
  })
  it("passes when no first load does", () => {
    const run = check(once)
    expect(run.stdout).toContain("no first load carries a module twice")
    expect(run.status).toBe(0)
  })
})
