import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const celebrateRing = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrateRing: (el: Element) => celebrateRing(el), prefersReducedMotion: () => false }))
vi.mock("@/components/task/taskSubTaskAssignee", () => ({ default: () => null }))
vi.mock("@/components/resizeableTextInput/resizeableTextInput", () => ({ default: ({ content }: { content: string }) => <span>{content}</span> }))

const { SubtasksSection } = await import("@/components/task/subtasksSection")

afterEach(() => {
  cleanup()
  celebrateRing.mockClear()
})

const sub = (id: string, status: string) => ({ task_uuid: id, task_name: `Step ${id}`, task_status: status, task_due_date: "" }) as never
const noop = () => {}
const section = (subtasks: never[], onToggleStatus = noop as (id: string, s: "done" | "todo") => void) => (
  <SubtasksSection
    isAdmin
    subtasks={subtasks}
    projectMembers={[]}
    onToggleStatus={onToggleStatus}
    onRename={noop}
    onUpdateStart={noop}
    onUpdateDue={noop}
    onUpdateAssignee={noop}
    onOpen={noop}
    onCreateSubtask={noop}
  />
)

/** Subtasks (work.md W30): no sparks for a subtask; the Ring tier when the last open one is ticked. */
describe("subtasks", () => {
  it("say how many are done, with a bar", () => {
    render(section([sub("1", "done"), sub("2", "done"), sub("3", "todo")]))
    expect(screen.getByText("2 of 3")).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: "2 of 3 subtasks done" })).toBeTruthy()
  })

  it("tick without a celebration while others are open", () => {
    const toggle = vi.fn()
    render(section([sub("1", "todo"), sub("2", "todo")], toggle))
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark Step 1 done" }))
    expect(toggle).toHaveBeenCalledWith("1", "done")
    expect(celebrateRing).not.toHaveBeenCalled()
  })

  it("ring when the last open one is ticked, from the bar's end", () => {
    render(section([sub("1", "done"), sub("2", "todo")]))
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark Step 2 done" }))
    expect(celebrateRing).toHaveBeenCalledTimes(1)
    expect((celebrateRing.mock.calls[0][0] as HTMLElement).hasAttribute("data-subtask-bar-end")).toBe(true)
  })

  it("never ring on un-ticking", () => {
    render(section([sub("1", "done"), sub("2", "done")]))
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark Step 2 as not done" }))
    expect(celebrateRing).not.toHaveBeenCalled()
  })
})
