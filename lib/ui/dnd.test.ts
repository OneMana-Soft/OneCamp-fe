import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core"

import { PRESS_LIFT } from "./pressLift"
import { containerCoordinates, dragAnnouncements, dragPoint, useDndSensors, useDragState } from "./dnd"

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
