import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { BAND, canonDiff, canonicalWeights, chunkModules, maskIds, maskNames, verdict } from "../scripts/fluidity/canondiff.mjs"

// Size is judged on canonical bytes (V-154, main's ruling 31 Oct 2026). Turbopack's chunk merge is size-greedy per
// chunk group and SWC picks short names per chunk, so a head that adds one lazy chunk can move the boundaries, the
// order and the minified names of modules it never touched, and the shipped gzip of every route that loads them.
// A route's canonical bytes take each module once, with chunk names and one- or two-character names masked, in one
// gzip stream: they move when the code moves, and only then. Module ids and the build id are the build's, not the
// code's (V-172: Turbopack renumbered the endpoints enum between two builds and 15 untouched routes read REAL), so
// they are masked too, and the modules are sorted by their masked text. Built in a folder of its own.

const dir = mkdtempSync(path.join(tmpdir(), "canondiff-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A Turbopack chunk: its script, then each module's id and factory. */
const chunk = (...mods: [number | string, string][]) =>
  `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,${mods.map(([id, f]) => `${id},${f}`).join(",")}]);\n//# sourceMappingURL=${mods[0][0]}.js.map`
/** A module's factory with its locals named: "#0" takes names[0], and so on. */
const named = (factory: string, names: string[]) => factory.replace(/#(\d)/g, (_, i: string) => names[Number(i)])

const RUNTIME = `(()=>{var e={},t=globalThis.TURBOPACK||[];function r(n){return e[n]}t.forEach(r)})();`
const LAYOUT = `function(#0){#0.s(["default",()=>#1]);var #2=#0.i(204410),#1=function(#3){return(0,#2.jsx)("main",{className:"app-shell flex min-h-dvh",children:#3.children})}}`
const TASK = `function(#0){#0.s(["default",()=>#1]);var #2=#0.i(204410),#1=function(#3){let[#4,#5]=(0,#2.useState)(#3.open);return(0,#2.jsx)("section",{"aria-label":"Task",className:"task-sheet grid gap-3",children:#4?#3.title:null,onClick:()=>#5(!#4)})}}`
const TASK_WITH_CYCLE = TASK.replace(`children:#4?#3.title:null`, `"data-cycle":#3.cycle??"No cycle",title:"Move the selected tasks to another cycle or milestone",children:#4?#3.title:null`)
const LIST = `function(#0){#0.s(["TaskList",()=>#1]);var #2=#0.i(204410);function #1(#3){return(0,#2.jsx)("ul",{role:"list",children:#3.tasks.map((#4)=>(0,#2.jsx)("li",{children:#4.name},#4.id))})}}`
const BOARD = `function(#0){#0.s(["default",()=>#1]);var #2=#0.i(204410),#1=function(){return(0,#2.jsx)("canvas",{className:"board-canvas absolute inset-0"})}}`
const LOADER = (...files: string[]) =>
  `#0=>{#0.v(#1=>Promise.all([${files.map((f) => `"static/chunks/${f}"`).join(",")}].map(#1=>#0.l(#1))).then(()=>#1(918273)))}`

type Build = { chunks: Record<string, string>; routes: Record<string, Record<string, string[]>>; buildId?: string; runtime?: string }
/** Writes a build the way routes.mjs reads one (its manifests, chunks and BUILD_ID) and returns its folder. */
const build = (name: string, { chunks, routes, buildId, runtime }: Build) => {
  const next = path.join(dir, name)
  const put = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(next, rel)), { recursive: true })
    writeFileSync(path.join(next, rel), text)
  }
  if (buildId) put("BUILD_ID", buildId)
  put("build-manifest.json", JSON.stringify({ rootMainFiles: ["/static/chunks/runtime.js"] }))
  put("static/chunks/runtime.js", runtime ?? RUNTIME)
  for (const [file, text] of Object.entries(chunks)) put(`static/chunks/${file}.js`, text)
  for (const [route, segments] of Object.entries(routes)) {
    const entryJSFiles = Object.fromEntries(Object.entries(segments).map(([at, files]) => [at, files.map((f) => `/static/chunks/${f}.js`)]))
    put(
      `server/app/${route}/page_client-reference-manifest.js`,
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {}; globalThis.__RSC_MANIFEST["/${route}/page"] = ${JSON.stringify({ entryJSFiles })}`,
    )
  }
  return next
}
const layout = { "[project]/app/layout": ["layout0"] }
const before = {
  layout0: chunk([101, named(LAYOUT, ["t", "e", "n", "r"])]),
  task0: chunk([102, named(TASK, ["t", "e", "n", "r", "a", "i"])], [105, named(LIST, ["t", "e", "n", "r", "a"])]),
  task1: chunk([103, named(LOADER("0dk2q8x1v7mzp.js"), ["t", "e"])]),
  board0: chunk([104, named(BOARD, ["t", "e", "n"])]),
}
const routes = {
  task: { ...layout, "[project]/app/task/page": ["task0", "task1"] },
  board: { ...layout, "[project]/app/board/page": ["board0"] },
}
// Before: the task page loads two chunks.
const A = build("before", { chunks: before, routes })
// The chunker alone moved: the task page's modules regrouped into other chunks, in another order, with other names,
// the list in both of them, and the loader's lazy group in three chunks (two scripts and a style) where it had one.
// The board page and the layout are untouched.
const B = build("recut", {
  chunks: {
    layout0: before.layout0,
    board0: before.board0,
    m3n0: chunk(
      [103, named(LOADER("3fz9w0c4hq1ld.js", "1k2j3h4g5f6d7.js", "02cs-hu5zz8of.css"), ["o", "s"])],
      [105, named(LIST, ["o", "s", "c", "u", "l"])],
    ),
    m3n1: chunk([105, named(LIST, ["r", "a", "i", "o", "s"])], [102, named(TASK, ["r", "a", "i", "o", "s", "Ab"])]),
  },
  routes: { ...routes, task: { ...layout, "[project]/app/task/page": ["m3n0", "m3n1"] } },
})
// A real change: the task page's own module gains code.
const C = build("real", {
  chunks: { ...before, task0: chunk([102, named(TASK_WITH_CYCLE, ["t", "e", "n", "r", "a", "i"])], [105, named(LIST, ["t", "e", "n", "r", "a"])]) },
  routes,
})
// A route added and a route removed.
const D = build("routes", {
  chunks: { ...before, cycles0: chunk([106, named(BOARD.replace("board-canvas", "cycle-grid"), ["t", "e", "n"])]) },
  routes: { task: routes.task, cycles: { ...layout, "[project]/app/cycles/page": ["cycles0"] } },
})

const row = <T extends { route: string }>(rows: T[], route: string) => rows.find((r) => r.route === route)

describe("a route's canonical bytes", () => {
  it("don't move when only the chunker moved: other boundaries, order, minified names and chunk hashes, a module in two chunks", () => {
    const a = canonicalWeights(A).get("app/task/page.tsx")
    const b = canonicalWeights(B).get("app/task/page.tsx")
    expect(b?.modules).toBe(a?.modules)
    expect(b?.hash).toBe(a?.hash)
    expect(b?.canon).toBe(a?.canon)
    expect(Math.abs((b?.shipped ?? 0) - (a?.shipped ?? 0))).toBeGreaterThan(BAND)
  })

  it("keep one text for a module two chunks carry differently, whichever chunk is read first", () => {
    // A three-letter name survives the mask, so the two copies differ; the chunks swap names between the builds.
    const long = named(LIST, ["t", "e", "n", "r", "abc"])
    const short = named(LIST, ["t", "e", "n", "r", "a"])
    const list = { list: { ...layout, "[project]/app/list/page": ["a0", "b0"] } }
    const P = build("twiceP", { chunks: { ...before, a0: chunk([105, long]), b0: chunk([105, short]) }, routes: list })
    const Q = build("twiceQ", { chunks: { ...before, a0: chunk([105, short]), b0: chunk([105, long]) }, routes: list })
    expect(canonicalWeights(Q).get("app/list/page.tsx")?.hash).toBe(canonicalWeights(P).get("app/list/page.tsx")?.hash)
  })

  it("move when a module's code moves", () => {
    const a = canonicalWeights(A).get("app/task/page.tsx")
    const c = canonicalWeights(C).get("app/task/page.tsx")
    expect(c?.hash).not.toBe(a?.hash)
    expect((c?.canon ?? 0) - (a?.canon ?? 0)).toBeGreaterThan(BAND)
  })
})

describe("a route's canonical bytes against the build's own numbers (V-172)", () => {
  it("don't move when the build only renumbered its modules: their own ids, the ids code names them by, the order ids gave", () => {
    // Every module has another id, the list now ahead of the task by id; the react module they import (204410) and
    // the loader's lazy one (918273, now the minifier's 26e4) were renumbered too. The same code.
    const renumber = (text: string) => text.replaceAll("204410", "377125").replaceAll("918273", "26e4")
    const R = build("renumbered", {
      chunks: {
        layout0: chunk([611, renumber(named(LAYOUT, ["t", "e", "n", "r"]))]),
        task0: chunk([722, renumber(named(TASK, ["t", "e", "n", "r", "a", "i"]))], [44, renumber(named(LIST, ["t", "e", "n", "r", "a"]))]),
        task1: chunk([833, renumber(named(LOADER("0dk2q8x1v7mzp.js"), ["t", "e"]))]),
        board0: chunk(["9e5", renumber(named(BOARD, ["t", "e", "n"]))]),
      },
      routes,
    })
    expect(canonicalWeights(R).get("app/task/page.tsx")?.hash).toBe(canonicalWeights(A).get("app/task/page.tsx")?.hash)
    const { rows, tally } = canonDiff(A, R)
    for (const route of ["app/task/page.tsx", "app/board/page.tsx"]) {
      expect(row(rows, route)).toMatchObject({ canonical: { delta: 0, same: true } })
      expect(["same", "RE-CUT"]).toContain(row(rows, route)?.verdict)
    }
    expect(tally.REAL).toBe(0)
  })

  it("don't move when the build only renumbered the modules its runtime runs first, and move when it runs another", () => {
    const runtime = (ids: string) => RUNTIME.replace("var e={}", `var e={runtimeModuleIds:[${ids}]}`)
    const hash = (name: string, ids: string) =>
      canonicalWeights(build(name, { chunks: before, routes, runtime: runtime(ids) })).get("app/task/page.tsx")?.hash
    const first = hash("runtime-first", "204410,611")
    expect(hash("runtime-renumbered", "377125,26e4")).toBe(first)
    expect(hash("runtime-another", "204410,611,722")).not.toBe(first)
  })

  it("don't move when only the build id differs, which a module may embed; any other string stays code", () => {
    const STAMP = `function(#0){#0.s(["default",()=>#1]);var #2=#0.i(204410),#1=function(){let #3="@ID";return(0,#2.jsx)("meta",{name:"build",content:#3})}}`
    const stamped = (name: string, id: string, buildId?: string) =>
      build(name, { buildId, chunks: { ...before, board0: chunk([104, named(STAMP.replace("@ID", id), ["t", "e", "n", "r"])]) }, routes })
    const board = (x: string, y: string) => row(canonDiff(x, y).rows, "app/board/page.tsx")
    const first = stamped("stampQ", "mvx53vj2-0qaff4", "mvx53vj2-0qaff4")
    const second = stamped("stampR", "mvx585ms-v2vb29", "mvx585ms-v2vb29")
    expect(board(first, second)).toMatchObject({ verdict: "same", canonical: { delta: 0, same: true } })
    // The same two strings in builds that don't say they are their ids: code that changed.
    expect(board(stamped("plainQ", "mvx53vj2-0qaff4"), stamped("plainR", "mvx585ms-v2vb29"))).toMatchObject({ canonical: { same: false } })
  })

  it("still see a one-byte change in a module's code, and a number the code's own function takes", () => {
    const board = (name: string, factory: string) =>
      row(canonDiff(A, build(name, { chunks: { ...before, board0: chunk([104, factory]) }, routes })).rows, "app/board/page.tsx")
    expect(board("onebyte", named(BOARD.replace("inset-0", "inset-1"), ["t", "e", "n"]))).toMatchObject({ canonical: { same: false } })
    const timed = (ms: number) => named(BOARD.replace("function(){return", `function(){#3(${ms});return`), ["t", "e", "n", "r"])
    const P = build("timed200", { chunks: { ...before, board0: chunk([104, timed(200)]) }, routes })
    const Q = build("timed300", { chunks: { ...before, board0: chunk([104, timed(300)]) }, routes })
    expect(row(canonDiff(P, Q).rows, "app/board/page.tsx")).toMatchObject({ canonical: { same: false } })
  })
})

describe("a route's verdict between two builds", () => {
  it("is RE-CUT when its shipped bytes moved and its canonical bytes did not, and same where nothing moved", () => {
    const { rows, tally } = canonDiff(A, B)
    expect(row(rows, "app/task/page.tsx")).toMatchObject({ verdict: "RE-CUT", canonical: { delta: 0, same: true } })
    expect(row(rows, "app/board/page.tsx")).toMatchObject({ verdict: "same", shipped: { delta: 0 }, canonical: { delta: 0, same: true } })
    expect(tally).toEqual({ REAL: 0, "RE-CUT": 1, same: 1, NEW: 0, GONE: 0 })
  })

  it("is REAL when its code changed", () => {
    const { rows, tally } = canonDiff(A, C)
    expect(row(rows, "app/task/page.tsx")).toMatchObject({ verdict: "REAL", canonical: { same: false } })
    expect(row(rows, "app/board/page.tsx")?.verdict).toBe("same")
    expect(tally).toEqual({ REAL: 1, "RE-CUT": 0, same: 1, NEW: 0, GONE: 0 })
  })

  it("is NEW or GONE for a route only one build has", () => {
    const { rows } = canonDiff(A, D)
    expect(rows.map((r) => [r.route, r.verdict])).toEqual([
      ["app/board/page.tsx", "GONE"],
      ["app/cycles/page.tsx", "NEW"],
      ["app/task/page.tsx", "same"],
    ])
  })

  it("charges the +/-8 B band on canonical bytes, and calls a shipped move within it a RE-CUT", () => {
    expect(BAND).toBe(8)
    expect(verdict(-481, 2)).toBe("RE-CUT")
    expect(verdict(777, -8)).toBe("RE-CUT")
    expect(verdict(54, 9)).toBe("REAL")
    expect(verdict(0, -9)).toBe("REAL")
    expect(verdict(8, 8)).toBe("same")
    expect(verdict(-9, 0)).toBe("RE-CUT")
  })
})

describe("a chunk's modules", () => {
  it("are split by id, each cut at its factory's end, never the chunk's wrapper or source map line", () => {
    const { mods, rest } = chunkModules(chunk([818121, "function(t){t.n(t.i(142702))}"], [1629, "t=>{t.v(5)}"], ["2e6", "(e,r)=>e.s(r)"]))
    expect([...mods.entries()]).toEqual([
      ["818121", "818121,function(_){_._(_._(142702))}"],
      ["1629", "1629,_=>{_._(5)}"],
      ["2e6", "2e6,(_,_)=>_._(_)"],
    ])
    expect(rest).toBeNull()
    // A closing it doesn't know (a block comment): the last module is still cut at its factory's end.
    const odd = chunk([4207, "function(t){t.v(1)}"]).replace(/\/\/# (.*)$/, "/*# $1 */")
    expect([...chunkModules(odd).mods.values()]).toEqual(["4207,function(_){_._(1)}"])
  })

  it("mask the module ids code names, and no other number (V-172)", () => {
    expect(maskIds(maskNames("var t=e.i(484310),n=e.r(12),r=e.A(2e6);"))).toBe("var _=_._(I),_=_._(I),_=_._(I);")
    expect(maskIds(maskNames("e.v(t=>Promise.all([].map(t=>e.l(t))).then(()=>t(95543)))"))).toBe("_._(_=>Promise.all([].map(_=>_._(_))).then(()=>_(I)))")
    expect(maskIds(`{otherChunks:[],runtimeModuleIds:[939800,12]}`)).toBe(`{otherChunks:[],runtimeModuleIds:[I,I]}`)
    expect(maskIds(`{otherChunks:[],runtimeModuleIds:[26e4,939800]}`)).toBe(`{otherChunks:[],runtimeModuleIds:[I,I]}`)
    // The code's own numbers: a call of its own function, a timer's delay, a one-digit argument.
    const own = maskNames("let a=n(200),b=setTimeout(r,150),c=e.i(5)")
    expect(maskIds(own)).toBe(own)
  })

  it("is the whole chunk, masked, when it has no module ids (the runtime)", () => {
    expect(chunkModules(RUNTIME)).toEqual({ mods: new Map(), rest: maskNames(RUNTIME) })
  })

  it("masks one- or two-character names and nothing longer, reads every chunk name alike and a list of them as one", () => {
    expect(maskNames(`var t=e.i(1),ab=x.useState,abc=1`)).toBe(`var _=_._(1),_=_.useState,abc=1`)
    expect(maskNames(`["static/chunks/0dk2q8x1v7mzp.js"]`)).toBe(maskNames(`["static/chunks/3fz9w0c4hq1ld.js"]`))
    expect(maskNames(`["static/chunks/0dk2q8x1v7mzp.js"]`)).not.toContain("0dk2q8x1v7mzp")
    // A lazy group's chunk count is the chunker's: three chunks, a style among them, read as the one they were.
    expect(maskNames(`["static/chunks/0dk2q8x1v7mzp.js","static/chunks/1k2j3h4g5f6d7.js","static/chunks/02cs-hu5zz8of.css"]`)).toBe(
      maskNames(`["static/chunks/3fz9w0c4hq1ld.js"]`),
    )
  })
})

describe("the command", () => {
  it("prints the summary, then every route with its shipped and canonical deltas and its verdict", () => {
    const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/fluidity/canondiff.mjs")
    const out = execFileSync(process.execPath, [tool, A, B, "--table"], { encoding: "utf8" }).trim().split("\n")
    expect(out[0]).toBe("routes 2: 0 REAL (canonical outside +/-8 B), 1 RE-CUT (shipped moved, canonical within +/-8 B), 1 same")
    expect(out[1]).toMatch(/^ {2}app\/board\/page\.tsx shipped \+0 canonical \+0 \(modules 2 -> 2\) same$/)
    expect(out[2]).toMatch(/^ {2}app\/task\/page\.tsx shipped [+-]\d+ canonical \+0 \(modules 4 -> 4\) RE-CUT$/)
    expect(JSON.parse(execFileSync(process.execPath, [tool, A, C, "--json"], { encoding: "utf8" })).tally.REAL).toBe(1)
  })
})
