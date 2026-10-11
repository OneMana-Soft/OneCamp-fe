import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const celebrateTask = vi.fn((_el: Element) => 8)
let reduced = false
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element) => celebrateTask(el), prefersReducedMotion: () => reduced }))

import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"

afterEach(() => {
  cleanup()
  celebrateTask.mockClear()
  reduced = false
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
