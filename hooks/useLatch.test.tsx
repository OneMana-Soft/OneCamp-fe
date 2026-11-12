import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"

import { sourceFiles } from "@/lib/testing/sourceFiles"
import { useLatch } from "./useLatch"

// "Once it has opened, keep it": a lazy dialog's part, a lead picker's members
// read, a doc's connection notice, a split view tucked away, a popover, the
// pause dialog, a date range's sheet, a guest's arrived document and the
// calendar's quick create, dialog and card were each written by hand, and a
// reminder's sheet had useFirstOpen (V-365, V-530 (4)). One hook now.
describe("useLatch", () => {
  it("is false until its condition first holds, then true for good", () => {
    const { result, rerender } = renderHook(({ on }) => useLatch(on), { initialProps: { on: false } })
    expect(result.current).toBe(false)
    rerender({ on: true })
    expect(result.current).toBe(true)
    rerender({ on: false })
    expect(result.current).toBe(true)
  })

  it("holds from the first render when its condition does", () => {
    const seen: boolean[] = []
    renderHook(() => {
      const held = useLatch(true)
      seen.push(held)
      return held
    })
    expect(seen).toEqual([true])
  })
})

// The idiom by hand: a flag set true once its condition holds and never set
// back to false (one that is, a doc's synced flag reset for the next doc, is
// a flag, not a latch). Read by shape, whatever the condition is written as
// (?., ===, any number of &&):
// - while rendering, "if (<anything> && !held) setHeld(true)", the setter
//   held's own;
// - in an effect, "useEffect(() => { if (<anything>) setY(true) }, [<deps>])".
const setterOf = (flag: string) => `set${flag[0].toUpperCase()}${flag.slice(1)}`
const inRender = (text: string) =>
  [...text.matchAll(/\bif \(([^\n]*?)\) (set\w+)\(true\)/g)]
    .filter(([, cond, set]) => cond.split("&&").some((part) => /^!\w+$/.test(part.trim()) && setterOf(part.trim().slice(1)) === set))
    .map((m) => m[2])
const inEffect = (text: string) =>
  [...text.matchAll(/useEffect\(\(\) => \{\s*if \(([^\n]*?)\) (\w+)\(true\);?\s*\}, \[[^\]\n]*\]\)/g)].map((m) => m[2])
const latches = (text: string) => [...inRender(text), ...inEffect(text)].filter((set) => !text.includes(`${set}(false)`))

describe("the latch", () => {
  it("is this hook's alone: no screen keeps 'once true, true for good' by hand", () => {
    const copies = sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/)
      .filter((f) => f !== "hooks/useLatch.ts" && latches(readFileSync(f, "utf8")).length > 0)
    expect(copies).toEqual([])
  })

  it("is found in either form, and a flag that is set back is not one", () => {
    expect(latches("if (open && !drawn) setDrawn(true)")).toHaveLength(1)
    expect(latches("React.useEffect(() => {\n    if (open) setArmed(true)\n  }, [open])")).toHaveLength(1)
    expect(latches("useEffect(() => { if (synced) setEver(true) }, [synced]); useEffect(() => { setEver(false) }, [id])")).toEqual([])
  })

  it("is found whatever its condition is written as (CR-B12 M1')", () => {
    expect(latches("if (sheet?.open && !drawn) setDrawn(true)")).toEqual(["setDrawn"])
    expect(latches("if (sheet && open && !inSheet && !used) setUsed(true)")).toEqual(["setUsed"])
    expect(latches('if (handoff === "pause" && !pauseUsed) setPauseUsed(true)')).toEqual(["setPauseUsed"])
    expect(latches("useEffect(() => {\n    if (connectionState?.isConnected) setWasLive(true)\n  }, [connectionState?.isConnected])")).toEqual(["setWasLive"])
    // A flag guarded by another one is not that flag's latch.
    expect(latches("if (open && !seen) setShown(true)")).toEqual([])
  })
})
