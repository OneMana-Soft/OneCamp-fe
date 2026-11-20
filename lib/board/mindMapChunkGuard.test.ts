import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"
import { importRe, resolve, sourceOf } from "../../scripts/fluidity/reach.mjs"

// MAIN's size ruling (17 Nov, miro-15): the mind map's layout (lib/board/mindMap) ships in ONE chunk. Turbopack copies
// a small module into every chunk group that imports it statically: imported so by the bar and the template library,
// it shipped in five chunks. Every import() of it, from any parent or route, loads the same one chunk (measured on
// the 17 Nov build), so it is only ever loaded with import(): the bar and the template library await it
// at their top, the AI panel where it lays a map out, the workbench beside the bar. `import type` ships nothing.
describe("the mind map layout's one chunk", () => {
  it("no file imports lib/board/mindMap statically", () => {
    const importers = sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/).filter((file) =>
      [...sourceOf(file).matchAll(importRe)].some((m) => resolve(m[1], file) === "lib/board/mindMap.ts"),
    )
    expect(importers).toEqual([])
  })
})

// N6 (CR-421): a module that awaits a chunk at its top makes every static importer wait for it too. Reached from a
// first-load module, that wait would sit on the critical path, which routes --check does not measure. So the modules
// that await (and those that import them statically) are reached only by import(), and this list changes on purpose.
// The bar's edition add-ons (lib/addOns/mindMap.ts, and the AI edition's mindMapAI.tsx) load with the bar alone.
describe("the modules that await at their top load only with import()", () => {
  const files = sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f))
  const importersOf = (target: string) => files.filter((file) => [...sourceOf(file).matchAll(importRe)].some((m) => resolve(m[1], file) === target))
  const awaitsAtTop = (file: string) => /^(?:export )?(?:const|let|var) [^=]*=\s*await |^await /m.test(sourceOf(file))

  it("awaiting: the bar and the template library with its picker, none of them imported statically from outside", () => {
    const awaiting = new Set(files.filter(awaitsAtTop))
    for (let grew = true; grew; ) {
      grew = false
      for (const f of [...awaiting])
        for (const by of importersOf(f).filter((b) => !awaiting.has(b))) {
          awaiting.add(by)
          grew = true
        }
    }
    expect([...awaiting].sort()).toEqual(["components/board/mindMapBar.tsx", "components/board/templatePicker.tsx", "lib/board/templateLibrary.ts"])
  })

  it("the bar's add-ons load with the bar alone", () => {
    expect(importersOf("lib/addOns/mindMap.ts")).toEqual(["components/board/mindMapBar.tsx"])
    for (const addOn of ["components/board/mindMapAI.tsx"].filter((f) => files.includes(f))) expect(importersOf(addOn)).toEqual(["lib/addOns/mindMap.ts"])
  })
})

