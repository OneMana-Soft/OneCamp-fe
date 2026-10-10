import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Profiler, type ReactNode } from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const makeRequest = vi.fn((_: unknown) => Promise.resolve({}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
// The editor, as a box whose onChange the test drives: what matters is what
// the component does with each change.
let type: (html: string) => void = () => {}
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ onChange }: { onChange: (c: string) => void }) => {
    type = onChange
    return <div data-editor="" />
  },
}))

const { TaskDescription, DESCRIPTION_SAVE_DELAY } = await import("@/components/task/taskDescription")

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  makeRequest.mockClear()
})

const saved = () => makeRequest.mock.calls.map((c) => (c[0] as { payload: { task_description: string; task_uuid: string } }).payload)

describe("the task description", () => {
  it("saves once, half a second after the typing stops", () => {
    render(<TaskDescription taskUUID="t1" projectUUID="p" html="<p>Old</p>" canEdit />)
    act(() => {
      type("<p>N</p>")
      type("<p>Ne</p>")
      type("<p>New</p>")
    })
    expect(makeRequest).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(DESCRIPTION_SAVE_DELAY))
    expect(saved()).toEqual([{ task_description: "<p>New</p>", task_uuid: "t1", task_project_uuid: "p" }])
  })

  it("saves what was typed when the panel moves to another task, under the first task", () => {
    const { rerender } = render(<TaskDescription taskUUID="t1" projectUUID="p" html="" canEdit />)
    act(() => type("<p>Half a thought</p>"))
    rerender(<TaskDescription taskUUID="t2" projectUUID="p" html="<p>Other</p>" canEdit />)
    expect(saved()).toEqual([{ task_description: "<p>Half a thought</p>", task_uuid: "t1", task_project_uuid: "p" }])
  })

  it("saves when the panel closes, and not at all when nothing changed", () => {
    const { unmount } = render(<TaskDescription taskUUID="t1" projectUUID="p" html="<p>Same</p>" canEdit />)
    act(() => type("<p>Same</p>"))
    unmount()
    expect(makeRequest).not.toHaveBeenCalled()
    const second = render(<TaskDescription taskUUID="t1" projectUUID="p" html="" canEdit />)
    act(() => type("<p>Closing now</p>"))
    second.unmount()
    expect(saved()).toHaveLength(1)
  })

  it("renders nothing while someone types: no state changes per keystroke", () => {
    let commits = 0
    const Wrap = ({ children }: { children: ReactNode }) => (
      <Profiler id="description" onRender={() => commits++}>
        {children}
      </Profiler>
    )
    render(<TaskDescription taskUUID="t1" projectUUID="p" html="" canEdit />, { wrapper: Wrap })
    const before = commits
    act(() => {
      for (let i = 1; i <= 40; i++) type(`<p>${"x".repeat(i)}</p>`)
    })
    expect(commits - before).toBe(0)
  })
})

describe("the task panel", () => {
  const panel = readFileSync(join(__dirname, "../rightPanel/taskInfoPanel.tsx"), "utf8")

  it("holds neither the description being typed nor the comment being written", () => {
    // Either one in the panel's state rendered the whole panel on every change.
    expect(panel).not.toMatch(/setTaskDescription|useDebounce\(taskDescription/)
    expect(panel).not.toMatch(/taskCommentInputState/)
    expect(panel).toMatch(/<TaskDescription\b/)
    expect(panel).toMatch(/<TaskCommentBox\b/)
  })
})
