import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { pathReaders, relatedArgs } from "./relatedTests.mjs"

// V-96: a unit test that reads a stylesheet by path (readFileSync("app/phone.css"))
// is not in the module graph, so `vitest related app/phone.css` never runs it.
// asana-12 (a) changed app/phone.css, its light check was green, and three of
// those tests failed only in the integrator's full gate. The light check runs
// every test that names a changed stylesheet, or walks the tree for them all.

describe("the tests a stylesheet change runs (V-96)", () => {
  it("app/phone.css runs the dialog and alert dialog sheet tests, which read it by path", () => {
    const tests = pathReaders(["app/phone.css"])
    expect(tests).toContain("components/ui/dialogSheet.test.tsx")
    expect(tests).toContain("components/ui/alertDialogSheet.test.tsx")
  })

  it("a stylesheet named through __dirname or ../ is found by its file name", () => {
    expect(pathReaders(["app/styles/admin/feedback.css"]).length).toBeGreaterThan(0)
  })

  it("a test that walks the tree for every stylesheet runs on any stylesheet change", () => {
    expect(pathReaders(["app/styles/admin/people.css"])).toContain("app/breakpoints.test.ts")
  })

  it("no stylesheet changed, no extra tests", () => {
    expect(pathReaders(["components/ui/toast.tsx"])).toEqual([])
  })

  it("vitest related gets every changed file, the readers beside them, and nothing deleted", () => {
    const args = relatedArgs(["components/ui/toast.tsx", "app/phone.css", "app/gone.css"])
    expect(args.slice(0, 2)).toEqual(["related", "--run"])
    expect(args).toContain("components/ui/toast.tsx")
    expect(args).toContain("app/phone.css")
    expect(args).toContain("components/ui/dialogSheet.test.tsx")
    expect(args).not.toContain("app/gone.css")
  })

  // CR-95's M1: a stylesheet deleted or renamed breaks exactly the tests that read it.
  it("a deleted stylesheet still runs the tests that read it, though vitest isn't given the file", () => {
    const args = relatedArgs(["app/moved/phone.css"])
    expect(args).toContain("components/ui/dialogSheet.test.tsx")
    expect(args).not.toContain("app/moved/phone.css")
  })

  // CR-95's M2: any file a test reads by path is outside the module graph, not only a stylesheet.
  it("a changed text or data file runs the tests that read it by path", () => {
    expect(pathReaders(["lib/utils/i18n/locales/en/en.json"])).toContain("app/copyRules.test.ts")
  })

  it("a source module adds no readers by name (the module graph has it)", () => {
    expect(pathReaders(["components/ui/toast.tsx", "lib/utils/helpers/cn.ts"])).toEqual([])
  })

  // CR-95's N1: with nothing changed there is nothing to run, and a bare `vitest related` would run it all.
  it("with no files, says how to use it and exits non-zero", () => {
    const run = spawnSync(process.execPath, ["scripts/relatedTests.mjs"], { encoding: "utf8" })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain("usage")
  })
})
