import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core"

import { PRESS_LIFT } from "./pressLift"
import { HoldTouchSensor, containerCoordinates, dragAnnouncements, dragPoint, useDndSensors, useDragState } from "./dnd"

// The shared drag (INTERACTION_SPEC §5).
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.querySelectorAll("[data-announce]").forEach((n) => n.remove())
})

const rect = (left: number, top: number, width = 100, height = 40) => ({ left, top, width, height, right: left + width, bottom: top + height })

describe("the sensors", () => {
  it("lift after the spec's 5px of mouse travel, or a 250ms finger hold within 8px", () => {
    const { result } = renderHook(() => useDndSensors())
    const [mouse, touch, keys] = result.current as unknown as Array<{ options: Record<string, unknown> }>
    expect(mouse.options.activationConstraint).toEqual({ distance: PRESS_LIFT.travel })
    expect(touch.options.activationConstraint).toEqual({ delay: PRESS_LIFT.hold, tolerance: PRESS_LIFT.slop })
    expect(keys.options.keyboardCodes).toEqual({ start: ["Space"], cancel: ["Escape", "Tab"], end: ["Space", "Enter"] })
  })
})

// A touchmove listener that isn't passive, on the window, makes every touch
// scroll wait for the main thread: the touch sensor keeps dnd-kit's standing
// one only on iOS and iPadOS, where WebKit settles at touchstart whether a
// touch's moves can be cancelled, so one added as a hold lifts is too late.
describe("the touch sensor's standing listener", () => {
  const blocking = (calls: unknown[][]) => calls.filter(([type, , opts]) => type === "touchmove" && typeof opts === "object" && opts !== null && (opts as AddEventListenerOptions).passive === false)
  const on = (userAgent: string, maxTouchPoints: number) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)
    Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true })
  }
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window.navigator, "maxTouchPoints", { value: 0, configurable: true })
  })

  it("is kept on an iPhone or an iPad, from mount until the surface closes", () => {
    on("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", 5)
    const added = vi.spyOn(window, "addEventListener")
    const removed = vi.spyOn(window, "removeEventListener")
    const teardown = HoldTouchSensor.setup()
    expect(blocking(added.mock.calls)).toHaveLength(1)
    teardown()
    expect(removed.mock.calls.filter(([type]) => type === "touchmove")).toHaveLength(1)
  })

  it("is never there anywhere else: a lifted drag adds its own (lib/ui/pressLift holdLifted)", () => {
    on("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", 5)
    const added = vi.spyOn(window, "addEventListener")
    HoldTouchSensor.setup()()
    expect(blocking(added.mock.calls)).toHaveLength(0)
  })
})

describe("the keyboard's move", () => {
  const context = (over: string | null) => ({
    collisionRect: rect(0, 100),
    over: over ? { id: over } : null,
    droppableContainers: {
      getEnabled: () => [
        { id: "todo", rect: { current: rect(0, 0, 100, 400) } },
        { id: "doing", rect: { current: rect(120, 0, 100, 400) } },
        { id: "done", rect: { current: rect(240, 0, 100, 400) } },
      ],
    },
  })
  it("goes to the next column that way, never the one it is over", () => {
    const right = containerCoordinates({ code: "ArrowRight", preventDefault: () => {} } as KeyboardEvent, { context: context("todo") } as never)
    expect(right?.x).toBe(120)
    const left = containerCoordinates({ code: "ArrowLeft", preventDefault: () => {} } as KeyboardEvent, { context: context("doing") } as never)
    expect(left).toBeUndefined()
  })
})

describe("the words", () => {
  it("says what was picked up, where it is, and where it landed or that it went back", () => {
    vi.useFakeTimers()
    const words = dragAnnouncements({
      name: () => "Launch plan",
      place: (id) => (id === "doing" ? { container: "Doing", position: 2, count: 5 } : { container: "To do" }),
    })
    const said = () => document.querySelector("[data-announce]")?.textContent
    words.onDragStart({ active: { id: "card" } } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("Picked up Launch plan. To do.")
    words.onDragOver({ active: { id: "card" }, over: { id: "doing" } } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("Doing, position 2 of 5.")
    words.onDragEnd({ active: { id: "card" }, over: { id: "doing" } } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("Dropped Launch plan in Doing, position 2 of 5.")
    words.onDragCancel({ active: { id: "card" }, over: null } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("Cancelled. Launch plan is back in To do.")
  })

  it("says what a target does as the item comes over it, where that says more than its place", () => {
    vi.useFakeTimers()
    const words = dragAnnouncements({
      name: () => "Pricing notes",
      place: (id) => ({ container: `the place before ${String(id)}` }),
      over: (id) => (id === "plan|swap" ? "Swap with Q4 launch plan" : null),
    })
    const said = () => document.querySelector("[data-announce]")?.textContent
    words.onDragOver({ active: { id: "notes" }, over: { id: "plan|swap" } } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("Swap with Q4 launch plan.")
    words.onDragOver({ active: { id: "notes" }, over: { id: "plan" } } as never)
    vi.advanceTimersByTime(100)
    expect(said()).toBe("the place before plan.")
  })
})

describe("a drag's state", () => {
  it("is where the pointer or finger is now, and nothing for the keyboard", () => {
    expect(dragPoint({ activatorEvent: new MouseEvent("mousedown", { clientX: 10, clientY: 20 }), delta: { x: 5, y: 6 } } as never)).toEqual({ x: 15, y: 26, touch: false })
    expect(dragPoint({ activatorEvent: new KeyboardEvent("keydown"), delta: { x: 5, y: 6 } } as never)).toBeNull()
  })

  it("marks the slot the item left, the target under it, and the page while it moves", () => {
    const { result } = renderHook(() => useDragState((_, over) => over !== "archived"))
    act(() => result.current.handlers.onDragStart({ active: { id: "card" } } as DragStartEvent))
    expect(result.current.dragState("card")).toBe("placeholder")
    expect(document.documentElement.getAttribute("data-dragging")).toBe("true")
    act(() => result.current.handlers.onDragOver({ active: { id: "card" }, over: { id: "archived" } } as never))
    expect(result.current.dropState("archived")).toBe("invalid")
    expect(document.documentElement.getAttribute("data-dragging")).toBe("invalid")
    act(() => result.current.handlers.onDragOver({ active: { id: "card" }, over: { id: "doing" } } as never))
    expect(result.current.dropState("doing")).toBe("valid")
    act(() => result.current.handlers.onDragMove({ activatorEvent: new KeyboardEvent("keydown"), delta: { x: 0, y: 0 } } as unknown as DragMoveEvent))
    act(() => result.current.handlers.onDragEnd({ active: { id: "card" }, over: { id: "doing" } } as never))
    expect(result.current.dragState("card")).toBeUndefined()
    expect(document.documentElement.hasAttribute("data-dragging")).toBe(false)
  })
})

// L-1 at 60 fps: the document's data-dragging is set as a drag begins and
// taken off as it ends. Chrome keys what a change restyles by the attribute's
// name, so one rule anywhere that styles the descendants of an element by
// data-dragging (html[data-dragging] *, a Tailwind group-data-[dragging=…]
// variant, which ends in *) made both moments restyle the whole page: 12,900
// elements under a 200-row list, 100 ms and more each time.
describe("the document's data-dragging", () => {
  it("restyles only the drag's own things: no rule styles everything under it", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs")
    const { join } = await import("node:path")
    const walk = (dir: string, ext: RegExp, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, ext, out)
        else if (ext.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
      }
      return out
    }
    const found: string[] = []
    for (const file of ["app", "components"].flatMap((d) => walk(d, /\.css$/))) {
      for (const m of readFileSync(file, "utf8").matchAll(/([^{};]*\[data-dragging[^{};]*)\{/g)) {
        const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim()
        // What a rule styles under [data-dragging…] is named, never a bare *.
        for (const part of sel.split(",")) if (/\[data-dragging[^\]]*\][^,]*\*/.test(part)) found.push(`${file}: ${part.trim()}`)
      }
    }
    // A named group or peer (group-data-[dragging]/cols) is a container that
    // marks its own drag, as the calendar's week does; in-data, or a bare
    // group or peer, can match the document's.
    for (const file of ["app", "components", "lib", "hooks"].flatMap((d) => walk(d, /\.tsx?$/)))
      for (const m of readFileSync(file, "utf8").matchAll(/(?:group|peer|in)-data-\[dragging[^\]]*\](?!\/)/g)) found.push(`${file}: ${m[0]}`)
    expect(found).toEqual([])
  })
})

// The drag's cursor is on dnd-kit's overlay, under the pointer, and never on
// the root (DRAG_OVERLAY, app/interaction.css): an overlay without the class
// carries its card with the resting cursor. The board's, the backlog's and the
// table board's lost the grabbing one when the root's rule went (L-1).
describe("the drag's cursor", () => {
  it("is on every DragOverlay", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs")
    const { join } = await import("node:path")
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
      }
      return out
    }
    const overlays: string[] = []
    const bare: string[] = []
    for (const file of ["app", "components"].flatMap((d) => walk(d)))
      for (const m of readFileSync(file, "utf8").matchAll(/<DragOverlay\b[^>]*>/g)) {
        overlays.push(file)
        if (!m[0].includes("DRAG_OVERLAY")) bare.push(`${file}: ${m[0]}`)
      }
    expect(overlays.length).toBeGreaterThan(0)
    expect(bare).toEqual([])
  })
})
