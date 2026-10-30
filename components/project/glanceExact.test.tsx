import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

const asked: string[] = []
const today = new Date().toISOString()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (key) asked.push(key)
    if (key.includes("taskListForKanban"))
      return { data: { data: { project_tasks_todo: [{ task_uuid: "t1", task_status: "todo", task_due_date: today }], project_column_counts: big ? { todo: 1500 } : { todo: 1 } } } }
    if (key.includes("/glance")) return { data: { data: { open: 1500, done: 4, overdue: 37, due_this_week: 12 } } }
    return { data: undefined }
  },
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [{ value: "todo", label: "To do", category: "todo" }] }) }))
let big = false

// Loaded here, as the file is collected, not in a test: the board's address
// builders and the endpoint list take seconds to transform on a busy machine,
// and that counted against one test's 5 s (sweep s6, at load ~38).
const { ProjectGlanceLine } = await import("@/components/project/ProjectGlanceLine")
const { withQuery } = await import("@/hooks/useClosedLimit")
const { boardQuery } = await import("@/lib/board/boardQuery")
const { GetEndpointUrl } = await import("@/services/endPoints")

pinTestClock()
afterEach(() => {
  cleanup()
  asked.length = 0
})

// PR1: on a project bigger than the board loads, the glance asks the server
// for its dates' counts and says them exactly; a project the board holds
// whole is counted from the cards, with no extra request.
describe("the glance on a big project", () => {
  it("says the server's exact counts, not 'at least'", () => {
    big = true
    const { container } = render(<ProjectGlanceLine projectId="p" />)
    expect(asked.some((k) => k.startsWith("/project/p/glance?tz="))).toBe(true)
    expect(container.textContent).toContain("37")
    expect(container.textContent).toContain("12")
    expect(container.textContent).not.toContain("+")
  })

  it("asks nothing more on a project the board holds whole", () => {
    big = false
    render(<ProjectGlanceLine projectId="p" />)
    expect(asked.some((k) => k.includes("/glance"))).toBe(false)
  })
})

// The glance counts the unfiltered board's own answer: one cache entry, so
// the board tab opens on it and the two never send the same read twice.
describe("the glance's read", () => {
  it("is the unfiltered board's request, address for address", () => {
    render(<ProjectGlanceLine projectId="p" />)
    expect([...new Set(asked.filter((k) => k.includes("taskListForKanban")))]).toEqual([withQuery(`${GetEndpointUrl.GetProjectTaskListForKanban}/p`, boardQuery([], ""))])
  })
})
