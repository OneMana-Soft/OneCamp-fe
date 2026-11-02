import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

import { pinTestClock } from "@/lib/testing/testClock"

// The task's dates are read against a fixed today.
pinTestClock()

/**
 * One field without a usable id never takes down a project's list (main, 2 Nov).
 * The list keys each field's column by the field's filter id, which the server
 * always sends; a column with no id throws, and on 2 Nov a stub's field without
 * one put the whole page in the error boundary at 1280. Such a field's column is
 * left out, the list says so once, and the rest of the page draws: its tasks, and
 * the Fields filter for the fields it can key.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

// The server's answers: the project's first page of tasks and its fields, one
// of which (Area) comes as E2E-4's stub sent it, without its filter id.
const server = vi.hoisted(() => {
  const answer = (data: unknown) => ({ data, isLoading: false, isError: undefined, mutate: async () => undefined })
  const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", manage: true, manage_people: true, archive: true }
  const task = {
    task_uuid: "7a5c00f1-0000-4000-8000-000000000001",
    task_name: "Write the launch post",
    task_status: "todo",
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_start_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_sub_task_count: 0,
    task_comment_count: 0,
  }
  const field = { project_id: "p", on_card: false }
  const fields = [
    { ...field, id: "c", name: "Channel", type: "select", position: 0, filter_id: "field_c", options: [{ id: "o1", label: "Blog", color: "violet" }] },
    { ...field, id: "a", name: "Area", type: "multi_select", position: 1, options: [{ id: "o2", label: "Data loss", color: "red" }] },
  ]
  return {
    nothing: answer(undefined),
    tasks: answer({ msg: "ok", pageCount: 1, data: { project_uuid: "p", project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_access: admin, project_tasks: [task] } }),
    fields: answer({ msg: "ok", data: { fields, can_edit: false } }),
  }
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url === "/project/p/fields" ? server.fields : url.startsWith("/project/taskList/") ? server.tasks : server.nothing),
  useFetchOnlyOnce: () => server.nothing,
  useMediaFetch: () => server.nothing,
}))

const { default: store } = await import("@/store/store")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { warmFieldFilter } = await import("@/components/task/taskTableFieldFilter")

const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
// The Fields filter's list is a chunk of its own; here it is in before the click.
beforeAll(async () => {
  await warmFieldFilter()
})
afterAll(() => {
  cleanup()
  warn.mockRestore()
})

const page = () => (
  <Provider store={store}>
    <ProjectTaskTable projectId="p" />
  </Provider>
)
const saidOfArea = () => warn.mock.calls.filter((c) => c.join(" ").includes("Area"))

describe("a project's list with a field that came without its filter id", () => {
  it("draws its tasks and leaves that field's column out, saying so once", async () => {
    const { rerender } = render(page())
    expect(await screen.findByText("Write the launch post")).toBeTruthy()
    rerender(page())
    expect(saidOfArea()).toHaveLength(1)
  })

  it("filters on the fields it can key, and offers none of the other's values", async () => {
    cleanup()
    render(page())
    expect(await screen.findByText("Write the launch post")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Fields/ }))
    expect(screen.getByText("Blog")).toBeTruthy()
    expect(screen.queryByText("Data loss")).toBeNull()
  })
})
