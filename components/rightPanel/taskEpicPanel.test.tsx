import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// jira-01 J-H web: where a task sits in its project's work hierarchy, in its
// panel. A task in an epic is top-level work (its dependencies and repeat, as
// the server reads it: taskDependency.go, taskRecurrence.go) with an Epic row;
// an epic lists its tasks with their statuses and no Epic row; a subtask has
// neither an Epic row nor subtasks of its own (the depth rule). Every task
// has its links.
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }) }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: () => new Promise(() => {}), post: () => new Promise(() => {}), interceptors: { request: { use: () => 0 }, response: { use: () => 0 } } },
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
  useParams: () => ({}),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
// The description's editor toolbar, as in components/rightPanel/taskMissingDates.test.tsx.
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const PROJECT = "7a6b5c4d-0000-4000-8000-0000000000e1"
const EPIC_TYPE = { id: "", builtin: "epic", name: "Epic", icon: "epic" }
const id = (n: number) => `7a6b5c4d-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`
const task = (uuid: string, over: Record<string, unknown> = {}) => ({
  task_uuid: uuid,
  task_name: "Write the launch post",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The post.</p>",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_access: { edit: true, delete: true, comment: true, log_time: true },
  task_project: { project_uuid: PROJECT, project_name: "Q4 launch", project_is_admin: true, project_members: [] },
  ...over,
})

function open(t: { task_uuid: string }, reads: Record<string, unknown> = {}) {
  const cache = new Map<string, unknown>([
    [`${GetEndpointUrl.GetTaskInfo}/${t.task_uuid}`, { data: { msg: "ok", data: t }, isLoading: false, isValidating: false }],
    ...Object.entries(reads).map(([key, data]) => [key, { data, isLoading: false, isValidating: false }] as const),
  ])
  render(<TaskInfoPanel taskUUID={t.task_uuid} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </Provider>
    ),
  })
  return act(() => new Promise((r) => setTimeout(r, 300)))
}

afterEach(cleanup)

describe("a task's place in the work hierarchy, in its panel (J-H web)", () => {
  pinTestClock()

  it("F12 a task in an epic is top-level work: its dependencies, its repeat, its links, and an Epic row naming the epic", async () => {
    const epic = { task_uuid: id(1), task_name: "Spring launch", task_key: "Q4-1", task_work_type: EPIC_TYPE }
    await open(task(id(2), { task_key: "Q4-2", task_parent_task: epic }))
    expect(screen.getByRole("heading", { name: "Dependencies" })).toBeTruthy()
    expect(screen.getByText("Doesn't repeat")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Linked tasks" })).toBeTruthy()
    const row = screen.getByRole("combobox", { name: "Epic" })
    expect(row.textContent).toContain("Q4-1")
    expect(row.textContent).toContain("Spring launch")
  }, 30_000)

  it("F16 a deleted task's panel offers no way to link, take a link off or move it to an epic; a live one does", async () => {
    const epic = { task_uuid: id(1), task_name: "Spring launch", task_key: "Q4-1", task_work_type: EPIC_TYPE }
    const links = { links: [{ kind: "relates", direction: "out", label: "relates to", task: { uuid: id(3), name: "Book the venue", key: "Q4-3", status: "todo", project_uuid: PROJECT } }], count: 1 }
    await open(task(id(2), { task_key: "Q4-2", task_parent_task: epic }), { [`/task/${id(2)}/links`]: links })
    expect(screen.getByRole("button", { name: "Link a task" })).toBeTruthy()
    expect(screen.getByRole("button", { name: 'Take off "relates to Book the venue"' })).toBeTruthy()
    expect((screen.getByRole("combobox", { name: "Epic" }) as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    await open(task(id(2), { task_key: "Q4-2", task_parent_task: epic, task_deleted_at: "2026-11-01T09:00:00Z" }), { [`/task/${id(2)}/links`]: links })
    expect(screen.getByText("Book the venue")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Link a task" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Take off/ })).toBeNull()
    expect((screen.getByRole("combobox", { name: "Epic" }) as HTMLButtonElement).disabled).toBe(true)
  }, 30_000)

  it("F13 an epic has no Epic row, and lists its tasks with their statuses, closed ones counted done", async () => {
    await open(
      task(id(3), {
        task_name: "Spring launch",
        task_work_type: EPIC_TYPE,
        task_sub_tasks: [
          task(id(4), { task_name: "Book the venue", task_key: "Q4-4", task_status: "done" }),
          task(id(5), { task_name: "Print the flyers", task_key: "Q4-5", task_status: "canceled" }),
          task(id(6), { task_name: "Write the post", task_key: "Q4-6", task_status: "inProgress" }),
        ],
      }),
    )
    expect(screen.queryByRole("combobox", { name: "Epic" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Tasks in this epic" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Subtasks" })).toBeNull()
    expect(screen.getByText("2 of 3")).toBeTruthy()
    const children = document.querySelectorAll("[data-subtask]")
    expect(children).toHaveLength(3)
    expect(children[2].textContent).toContain("Q4-6")
    // A status, not a done box: an epic's tasks have their whole workflow.
    expect(children[2].querySelector("[data-tip]")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Mark Write the post done" })).toBeNull()
    expect(screen.getByRole("button", { name: "Add a task to this epic" })).toBeTruthy()
  }, 30_000)

  it("F14 a subtask has no Epic row and takes no subtasks of its own", async () => {
    await open(task(id(7), { task_parent_task: { task_uuid: id(8), task_name: "Write the launch post" } }))
    expect(screen.queryByRole("combobox", { name: "Epic" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add subtask" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Dependencies" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Linked tasks" })).toBeTruthy()
  }, 30_000)

  it("F15 a top-level task has an Epic row with none, and its subtasks", async () => {
    await open(task(id(9)))
    expect(screen.getByRole("combobox", { name: "Epic" }).textContent).toContain("No epic")
    expect(screen.getByRole("button", { name: "Add subtask" })).toBeTruthy()
  }, 30_000)
})
