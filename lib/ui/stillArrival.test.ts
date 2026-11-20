import { describe, expect, it, vi } from "vitest"
import { reach } from "../../scripts/fluidity/reach.mjs"
import type { PointerEvent as ReactPointerEvent } from "react"

// A row drawn or moved under a resting pointer gets the browser's hover update: pointerover and pointerenter at the
// place the pointer already was, and no pointermove (fluid-19: a J's scroll lit row 20 under a mouse resting where it
// clicked). An arrival is pointing only where the pointer moved.
describe("an arrival the pointer did not move to", () => {
  const send = (type: string, x: number, y: number) =>
    document.body.dispatchEvent(new ((window.PointerEvent ?? MouseEvent) as typeof MouseEvent)(type, { bubbles: true, clientX: x, clientY: y }))
  const arrival = (type: string, clientX: number, clientY: number) => ({ type, clientX, clientY })

  it("is still where the last move left the pointer, so the row it lands on doesn't light; a move to it does", async () => {
    vi.resetModules()
    const { isStillArrival: still } = await import("./stillArrival")
    send("pointermove", 100, 200)
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter"]) {
      expect(still(arrival(type, 100, 200)), `${type} where the pointer rests`).toBe(true)
    }
    expect(still(arrival("pointerover", 100.4, 199.6)), "within a pixel").toBe(true)
    expect(still(arrival("pointermove", 100, 200)), "a move is someone pointing").toBe(false)
    expect(still(arrival("pointerover", 130, 200)), "an arrival the pointer moved to").toBe(false)
    send("pointermove", 130, 200)
    expect(still(arrival("pointerover", 130, 200)), "the arrival's own move came first").toBe(true)
    send("pointerdown", 300, 40)
    expect(still(arrival("pointerenter", 300, 40)), "a press places the pointer too").toBe(true)
    expect(still(arrival("pointerenter", 300, 80))).toBe(false)
  })

  it("is still before any move is seen: a page drawn under a resting pointer lights nothing till it moves", async () => {
    vi.resetModules()
    const fresh = await import("./stillArrival")
    expect(fresh.isStillArrival(arrival("pointerover", 5, 5))).toBe(true)
    send("pointermove", 5, 5)
    expect(fresh.isStillArrival(arrival("pointerover", 9, 5))).toBe(false)
  })

  // Its listener runs on every pointer move, so it ships only where a hover-lit row loads it (MAIN 14 Nov).
  it("is never reached from the app's layouts", () => {
    for (const layout of ["app/layout.tsx", "app/app/layout.tsx"]) {
      expect([...reach(layout).keys()], layout).not.toContain("lib/ui/stillArrival.ts")
    }
  })
})

// The same rule lives twice: the menus' lib/ui/stillPointer.ts and the rows' stillArrival.ts (its header says why).
// One fixture goes through both, so neither drifts: on an arrival after a move they agree; where they differ, on
// purpose, the differences are pinned here.
describe("the menus' stillPointer and the rows' stillArrival", () => {
  const send = (type: string, x: number, y: number) =>
    document.body.dispatchEvent(new ((window.PointerEvent ?? MouseEvent) as typeof MouseEvent)(type, { bubbles: true, clientX: x, clientY: y }))
  const rules = async () => {
    vi.resetModules()
    const { isStillArrival } = await import("./stillArrival")
    const { movingPointerOnly } = await import("./stillPointer")
    // The menus' rule, read by its own guard: it marks a still pointer's event defaultPrevented.
    const menu = (q: { type: string; clientX: number; clientY: number }) => {
      let still = false
      movingPointerOnly({}).onPointerLeave({ nativeEvent: q, preventDefault: () => (still = true) } as never)
      return still
    }
    return { row: isStillArrival, menu }
  }
  // [move to x, y] then [an arrival's type, x, y]
  const FIXTURE: [number, number, string, number, number][] = [
    [100, 200, "pointerover", 100, 200],
    [100, 200, "pointerenter", 130, 200],
    [130, 200, "pointerover", 130, 200],
    [130, 200, "mouseover", 131, 200],
    [40, 40, "pointerenter", 40, 41],
    [7, 9, "mouseenter", 7, 9],
  ]

  it("agree on every arrival after a move", async () => {
    const { row, menu } = await rules()
    for (const [mx, my, type, x, y] of FIXTURE) {
      send("pointermove", mx, my)
      const q = { type, clientX: x, clientY: y }
      expect(row(q), `${type} at ${x},${y} after a move to ${mx},${my}`).toBe(menu(q))
    }
  })

  it("differ only where the rows' rule says: before any move, and within a pixel", async () => {
    const { row, menu } = await rules()
    const q = { type: "pointerover", clientX: 5, clientY: 5 }
    expect([row(q), menu(q)], "before any move").toEqual([true, false])
    send("pointermove", 100, 200)
    const near = { type: "pointerover", clientX: 100.4, clientY: 199.6 }
    expect([row(near), menu(near)], "within a pixel").toEqual([true, false])
  })
})

// V-1054 R1 (CR-340 #3): isStillMove compares the move with the native one the window saw; a React event never is that
// one, so for it the answer was always "still". Its type takes only the native PointerEvent.
describe("isStillMove takes the native move only", () => {
  it("refuses a React pointer event by its type", async () => {
    const { isStillMove } = await import("./stillArrival")
    const reactMove = { type: "pointermove", clientX: 3, clientY: 4, nativeEvent: {} } as unknown as ReactPointerEvent<HTMLElement>
    // @ts-expect-error a React event is not the native PointerEvent isStillMove reads
    expect(typeof isStillMove(reactMove)).toBe("boolean")
  })
})
