import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { pathReaders, relatedArgs, sourceReaders } from "./relatedTests.mjs"

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

  it("no stylesheet or data file changed, no readers of one", () => {
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

// V-1024: a guard that reads the source by path imports none of what it reads, so `vitest related`
// on a component never ran it, and gcal-14 web shipped a red instantSaveGuard and a red
// drawerPrimitive through two light checks and a review. A module change runs every test that
// reads the source: one that reads files and names the changed file, or walks the tree for .tsx.
describe("the tests a source change runs (V-1024)", () => {
  it("a component change runs the guards that walk the source for .tsx", () => {
    const args = relatedArgs(["components/task/GroupedTaskList.tsx"])
    expect(args).toContain("components/ui/instantSaveGuard.test.ts")
    expect(args).toContain("components/ui/drawerPrimitive.test.tsx")
  })

  it("a guard that walks the source through the shared walk runs on any module change", () => {
    expect(relatedArgs(["hooks/useLatch.ts"])).toContain("app/personHue.test.ts")
  })

  it("a change to a file a guard names by path runs that guard", () => {
    expect(relatedArgs(["components/banner/EmailOffBanner.tsx"])).toContain("app/emailOffBanner.test.ts")
  })

  it("a deleted or moved module still runs the guards that walk the source, though vitest isn't given it", () => {
    const args = relatedArgs(["components/banner/Gone.tsx"])
    expect(args).toContain("components/ui/instantSaveGuard.test.ts")
    expect(args).not.toContain("components/banner/Gone.tsx")
  })

  // styleDialects walks for .css, and was this case's walker for .css alone until V-1032: it also
  // lists the board's folders under components/kanbanComponents and names every source root, and
  // which folder each of its walks lists can't be told from the source, so a component runs it.
  it("only tests that read the source: not one that reads a stylesheet alone", () => {
    const tests = sourceReaders(["components/task/GroupedTaskList.tsx"])
    expect(tests).not.toContain("components/ui/dialogSheet.test.tsx")
    expect(tests).not.toContain("components/task/listRowRenders.test.tsx")
    expect(tests).toContain("components/styleDialects.test.ts")
  })

  it("no module changed, no source readers: a stylesheet or data file selects as before", () => {
    expect(sourceReaders(["app/phone.css", "lib/utils/i18n/locales/en/en.json"])).toEqual([])
  })
})

// V-1032: two kinds of source guard still never ran in the light check. One lists a folder's
// entries with no file pattern (appSegments lists the route folders under app/app, styleDialects
// the board's folders under components/kanbanComponents): it names a folder, not a file, and asks
// for no .ts/.tsx. The other builds a module's file name from parts (`${base}.tsx` while it
// follows an import chain, `components/drawers/${file}.tsx`), so the changed file's whole name is
// never in it. A new route folder, or a module that breaks an admin, call or doc-editor budget,
// went red only in the full gate.
describe("the guards that list a folder or build a file name (V-1032)", () => {
  it("a file added, deleted or moved under a folder a guard lists runs that guard", () => {
    expect(relatedArgs(["app/app/newPlace/page.tsx"])).toContain("lib/nav/appSegments.test.ts")
    expect(relatedArgs(["components/kanbanComponents/Ghost/Ghost.tsx"])).toContain("components/styleDialects.test.ts")
    const moved = relatedArgs(["components/kanbanComponents/Item/Item.tsx", "components/kanbanComponents/Card/Item.tsx"])
    expect(moved).toContain("components/styleDialects.test.ts")
  })

  it("a guard that lists a folder runs only for a change inside the folder it names", () => {
    expect(relatedArgs(["hooks/useLatch.ts"])).not.toContain("lib/nav/appSegments.test.ts")
    expect(relatedArgs(["app/(showcase)/AppShellMark.tsx"])).not.toContain("lib/nav/appSegments.test.ts")
    const tests = sourceReaders(["components/task/GroupedTaskList.tsx"])
    expect(tests).not.toContain("lib/pwa/svgAssets.test.ts")
    expect(tests).not.toContain("components/docEditor/history/diff/fixtures.test.ts")
  })

  it("a file that is no module, added under a folder a guard lists, runs that guard too", () => {
    expect(pathReaders(["public/icons/new.svg"])).toContain("lib/pwa/svgAssets.test.ts")
    expect(pathReaders(["testdata/codec/new.json"])).toContain("components/docEditor/history/diff/fixtures.test.ts")
  })

  it("a guard that builds a module's file name from parts runs on a module change", () => {
    const args = relatedArgs(["components/docEditor/registry/commandBus.ts"])
    for (const guard of [
      "app/adminFirstLoad.test.ts",
      "app/app/shellAddress.test.ts",
      "components/admin/peopleFrame.test.tsx",
      "components/call/effects/effects.test.tsx",
      "components/docEditor/registry/bundle.test.ts",
      "components/docEditor/technical/register.test.ts",
      "components/mobileMessage/threadDeleteOneAsk.test.ts",
      "components/rightPanel/threadPanelMotion.test.ts",
    ]) expect(args).toContain(guard)
  })

  it("a test whose templates make URLs, not file names, is no source reader", () => {
    expect(sourceReaders(["components/task/GroupedTaskList.tsx"])).not.toContain("lib/pwa/sw.test.ts")
  })
})
