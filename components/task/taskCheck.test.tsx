import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const celebrateTask = vi.fn((_el: Element) => 8)
let reduced = false
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element) => celebrateTask(el) }))
vi.mock("@/lib/reducedMotion", () => ({ prefersReducedMotion: () => reduced }))

import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"
import { warmBursts } from "@/lib/celebrateSoon"

// The sparks are a chunk the page fetches when idle (lib/celebrateSoon): in
// these tests it is in before the first click.
beforeAll(async () => {
  await warmBursts()
})

afterEach(() => {
  cleanup()
  celebrateTask.mockClear()
  reduced = false
  vi.unstubAllGlobals()
})

const todo = { value: "todo", label: "To do", category: "todo" as const }

/** The completable check (work.md W03): the status glyph made pressable. */
describe("the task check", () => {
  it("completes once per click, bursting from itself, and says what it does", () => {
    const onToggle = vi.fn()
    render(<TaskCheck done={false} status={todo} taskName="Write the launch announcement" onToggle={onToggle} />)
    const check = screen.getByRole("button", { name: "Mark Write the launch announcement complete" })
    expect(check).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(check)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith(true, check)
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })

  it("plays the fill on the click that completes it, and reopens with no sparks", () => {
    const onToggle = vi.fn()
    const { rerender, container } = render(<TaskCheck done={false} status={todo} taskName="T" onToggle={onToggle} />)
    fireEvent.click(screen.getByRole("button"))
    rerender(<TaskCheck done status={todo} taskName="T" onToggle={onToggle} />)
    expect(container.querySelector("[data-anim='fill']")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Mark T as not done" }))
    expect(onToggle).toHaveBeenLastCalledWith(false, expect.anything())
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })

  it("asks for the picker on Alt-click instead of completing", () => {
    const onToggle = vi.fn()
    const onPicker = vi.fn()
    render(<TaskCheck done={false} status={todo} taskName="T" onToggle={onToggle} onPicker={onPicker} />)
    fireEvent.click(screen.getByRole("button"), { altKey: true })
    expect(onPicker).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it("does nothing without the right to, and previews nothing", () => {
    const onToggle = vi.fn()
    const { container } = render(<TaskCheck done={false} status={todo} taskName="T" onToggle={onToggle} disabled />)
    fireEvent.click(screen.getByRole("button"))
    expect(onToggle).not.toHaveBeenCalled()
    expect(container.querySelector("[data-check-preview]")).toBeNull()
  })

  it("strikes a finished title", () => {
    const { container } = render(<TaskTitle done>Plan the load test</TaskTitle>)
    expect(container.querySelector("[data-strike]")).not.toBeNull()
  })
})

describe("the task check, before its sparks are in", () => {
  // A page whose sparks haven't loaded: a fresh lib/celebrateSoon, nothing fetched.
  const fresh = async () => {
    vi.resetModules()
    return { ...(await import("@/components/task/TaskCheck")), ...(await import("@/lib/celebrateSoon")) }
  }

  it("completes at once and skips the sparks, which the next finish has", async () => {
    const { TaskCheck, sparkedRecently, warmBursts } = await fresh()
    const onToggle = vi.fn()
    render(<TaskCheck done={false} status={todo} taskName="T" onToggle={onToggle} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onToggle).toHaveBeenCalledWith(true, screen.getByRole("button"))
    expect(celebrateTask).not.toHaveBeenCalled()
    // The finish is noted all the same: a project's Camp moment that follows is this person's.
    expect(sparkedRecently()).toBe(true)
    await act(async () => {
      await warmBursts()
    })
    fireEvent.click(screen.getByRole("button"))
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })

  it("fetches them when the page is idle, once, so the first finish after a load bursts", async () => {
    const idle: (() => void)[] = []
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => idle.push(cb))
    const { TaskCheck } = await fresh()
    render(
      <>
        <TaskCheck done={false} status={todo} taskName="A" onToggle={vi.fn()} />
        <TaskCheck done={false} status={todo} taskName="B" onToggle={vi.fn()} />
      </>,
    )
    expect(idle).toHaveLength(1)
    await act(async () => {
      idle[0]()
      await vi.dynamicImportSettled()
    })
    fireEvent.click(screen.getByRole("button", { name: "Mark A complete" }))
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })
})

describe("the task check, under reduced motion", () => {
  it("shows the filled disc at once, with no animation", () => {
    reduced = true
    const onToggle = vi.fn()
    const { rerender, container } = render(<TaskCheck done={false} status={todo} taskName="T" onToggle={onToggle} />)
    fireEvent.click(screen.getByRole("button"))
    rerender(<TaskCheck done status={todo} taskName="T" onToggle={onToggle} />)
    expect(container.querySelector("[data-status-glyph='done']")).not.toBeNull()
    expect(container.querySelector("[data-anim]")).toBeNull()
  })
})
