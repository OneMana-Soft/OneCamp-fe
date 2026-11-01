// @vitest-environment node
import { SourceMap } from "node:module"
import { describe, expect, it } from "vitest"
import { loadsStarted } from "@/lib/testing/lazyCode"
import { placeIn } from "@/lib/testing/sourceFiles"
import { importAnalysisMap, isAppSource, trackImports } from "@/lib/testing/trackImports"
import { byString, byTemplate, byVariable } from "@/testdata/lazyCode/forms"
import { loadThenThrow } from "@/testdata/lazyCode/throwsAfterLoad"

// V-138: vitest.config.ts compiles app source with lib/testing/trackImports, which hands every import() to the
// registry's trackLoad (lib/testing/lazyCode), so the tests' one code wait knows what's coming however the app loads
// it. This file runs in node on purpose: a node test file runs app import()s too.

const ROOT = "/repo"
const tracked = (load: string) => `globalThis.__trackLoad(() => ${load})`
const transformed = async (code: string) => (await trackImports(code, `${ROOT}/components/piece.tsx`))?.code

describe("the transform", () => {
  it("hands an import() of a string to trackLoad, as written", async () => {
    expect(await transformed(`const code = import("./piece")`)).toBe(`const code = ${tracked(`import("./piece")`)}`)
  })

  it("hands an import() of a template over whole", async () => {
    const load = "import(`./locales/${lang}.json`)"
    expect(await transformed(`const words = ${load}`)).toBe(`const words = ${tracked(load)}`)
  })

  it("hands an import() of a variable over whole", async () => {
    expect(await transformed("const code = import(path)")).toBe(`const code = ${tracked("import(path)")}`)
  })

  it("leaves /* @vite-ignore */ inside the import(), where Vite reads it", async () => {
    const load = "import(/* @vite-ignore */ url)"
    expect(await transformed(`const code = ${load}`)).toBe(`const code = ${tracked(load)}`)
  })

  it("keeps import attributes inside the call", async () => {
    const load = `import("./words.json", { with: { type: "json" } })`
    expect(await transformed(`const words = ${load}`)).toBe(`const words = ${tracked(load)}`)
  })

  it("hands over every import() in a module, a chained one included", async () => {
    const code = `const [a, b] = await Promise.all([import("./a"), import("./b").then((m) => import(m.next))])`
    expect(await transformed(code)).toBe(
      `const [a, b] = await Promise.all([${tracked(`import("./a")`)}, ${tracked(`import("./b")`)}.then((m) => ${tracked("import(m.next)")})])`,
    )
  })

  it("starts with a name, so a line before it with no semicolon still ends where it did", async () => {
    // A "(" there would call the line before: `const a = b` then `(...)` reads as `const a = b(...)`.
    expect(await transformed(`const a = b\nimport("./x").then(f)`)).toBe(`const a = b\n${tracked(`import("./x")`)}.then(f)`)
  })

  it("leaves an import() whose argument awaits or yields as it is: in a function of its own, the pause would move", async () => {
    expect(await transformed("async function f() { return import(await where()) }")).toBeUndefined()
    expect(await transformed("function* g() { return import(yield) }")).toBeUndefined()
  })

  it("leaves static imports, import.meta and code with no import() alone", async () => {
    expect(await transformed(`import a from "./a"\nexport { b } from "./b"\nexport const here = import.meta.url`)).toBeUndefined()
  })

  it("writes a source map of the module it changed", async () => {
    const code = `const code = import("./piece")`
    const out = await trackImports(code, `${ROOT}/components/piece.tsx`)
    expect(out?.map.sources).toEqual([`${ROOT}/components/piece.tsx`])
    expect(out?.map.sourcesContent).toEqual([code])
    expect(out?.map.mappings).not.toBe("")
  })
})

describe("the map of what Vite's import analysis writes over a module", () => {
  const id = `${ROOT}/components/piece.tsx`
  /** Where `text` in `out` comes from in `code`, by importAnalysisMap's map: [line, column], from 0. */
  const origin = async (code: string, out: string, text: string) => {
    const map = await importAnalysisMap(code, out, id)
    expect(map).not.toBeNull()
    const at = new SourceMap(JSON.parse(String(map))).findEntry(0, out.indexOf(text)) as { originalLine?: number; originalColumn?: number }
    return [at.originalLine, at.originalColumn]
  }

  it("maps each column after an import it points at its module back to its source", async () => {
    const code = `const code = import("./piece").then(() => thrown())`
    const out = `const code = import("/components/piece.tsx").then(() => thrown())`
    expect(await origin(code, out, "thrown")).toEqual([0, code.indexOf("thrown")])
  })

  it("maps a static import written again in its own quotes, and the imports it puts in front", async () => {
    const code = `import a from './a'; a.then(() => thrown())`
    const out = `import { injectQuery as __vite__injectQuery } from "/@vite/client";import a from "/a.ts"; a.then(() => thrown())`
    expect(await origin(code, out, "thrown")).toEqual([0, code.indexOf("thrown")])
  })

  it("maps an import of a variable that it hands to __vite__injectQuery", async () => {
    const code = "const m = import(path).then(() => thrown())"
    const out = "const m = import(__vite__injectQuery(path, 'import')).then(() => thrown())"
    expect(await origin(code, out, "thrown")).toEqual([0, code.indexOf("thrown")])
  })

  it("gives no map when nothing changed, or when what changed isn't an import", async () => {
    const code = `const code = import("./piece")`
    expect(await importAnalysisMap(code, code, id)).toBeNull()
    expect(await importAnalysisMap(code, `const kode = import("/components/piece.tsx")`, id)).toBeNull()
  })
})

describe("its scope: app source only", () => {
  const setupFiles = ["./vitest.setup.ts"]

  it.each([
    "components/board/boardWorkbench.tsx",
    "lib/loadChunk.ts",
    "app/app/layout.tsx",
    "hooks/useBulkTaskUpdate.ts",
    "testdata/lazyCode/pieces.tsx",
  ])("compiles %s", (path) => {
    expect(isAppSource(`${ROOT}/${path}`, ROOT, setupFiles)).toBe(true)
  })

  it.each([
    "node_modules/react/index.js",
    "node_modules/.pnpm/next@16.3.8/node_modules/next/dist/shared/lib/dynamic.js",
    ".next/server/app/page.js",
    "components/board/boardWorkbench.test.tsx",
    "lib/lazy/lazyPiece.test.tsx",
    "e2e/offlineColdStart.spec.ts",
    "e2e/helpers.ts",
    "scripts/relatedTests.mjs",
    "public/sw.js",
    "lib/testing/lazyCode.ts",
    "vitest.setup.ts",
    "app/globals.css",
  ])("passes over %s", (path) => {
    expect(isAppSource(`${ROOT}/${path}`, ROOT, setupFiles)).toBe(false)
  })

  it("judges an id by its file, not its query", () => {
    expect(isAppSource(`${ROOT}/components/banner/DemoSharedNote.tsx?outside-the-demo`, ROOT)).toBe(true)
    expect(isAppSource(`${ROOT}/components/banner/demoSharedNote.test.tsx?v=1`, ROOT)).toBe(false)
  })

  it("passes over virtual modules and files outside the root", () => {
    expect(isAppSource("\0virtual:module", ROOT)).toBe(false)
    expect(isAppSource("/elsewhere/components/piece.tsx", ROOT)).toBe(false)
  })
})

describe("in this run (vitest.config.ts)", () => {
  const forms: Array<[string, () => Promise<{ target: string }>]> = [
    ["a string", () => byString()],
    ["a template", () => byTemplate("target")],
    ["a variable", () => byVariable("@/testdata/lazyCode/target")],
  ]

  it.each(forms)("knows an app import() of %s while it loads, and the module comes as written", async (_, load) => {
    const before = loadsStarted()
    const code = await load()
    expect(loadsStarted()).toBe(before + 1)
    expect(code.target).toBe("loaded")
  })

  it("keeps a thrown error's stack at the line and column of its source", async () => {
    const thrown = await loadThenThrow().then(
      () => null,
      (error: Error) => error,
    )
    expect(thrown?.stack).toContain(placeIn("testdata/lazyCode/throwsAfterLoad.ts", "new Error"))
  })
})
