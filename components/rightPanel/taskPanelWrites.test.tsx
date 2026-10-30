import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// The task panel's writes and its failed reads, on a whole panel over a real
// SWR cache:
//   - PTC-2: Mark complete with the server refusing it. The panel stayed Done
//     while the list said In progress, and the page raised an uncaught error.
//   - PTC-4: a task that isn't there said "a connection problem".
//   - PTC-24: Delete took one click, with no Undo anywhere but the open
//     task's own banner, and the header said Completed beside that banner.

const h = vi.hoisted(() => ({
  posts: [] as Array<{ apiEndpoint: string; payload: Record<string, unknown> }>,
  axiosPosts: [] as string[],
  refuse: new Set<string>(),
  readError: null as unknown,
  params: {} as Record<string, string>,
  path: "/app/project/p",
  toasts: [] as Array<{ title?: string; action?: unknown }>,
}))

vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: (req: { apiEndpoint: string; payload: Record<string, unknown> }) => {
      h.posts.push(req)
      return h.refuse.has(req.apiEndpoint) ? Promise.reject(Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } })) : Promise.resolve({})
    },
    isSubmitting: false,
  }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (url: string) => (h.readError && url.includes("/task/info/") ? Promise.reject(h.readError) : new Promise(() => {})),
    post: (url: string, body?: { op?: string }) => {
      h.axiosPosts.push(url === "/task/bulk" ? `bulk:${body?.op}` : url)
      return h.refuse.has(url) ? Promise.reject(new Error("500")) : Promise.resolve({ data: {} })
    },
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
  },
}))
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; action?: unknown }) => {
    h.toasts.push(t)
    return { id: "t", dismiss: () => {}, update: () => {} }
  }
  return { toast, useToast: () => ({ toast, toasts: [], dismiss: () => {} }) }
})
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => h.path,
  useParams: () => h.params,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))

const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { default: TaskPage } = await import("@/app/app/task/[task-id]/page")
const { PostEndpointUrl, GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { DocumentTitle } = await import("@/components/common/DocumentTitle")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000002"
const TASK = {
  task_uuid: "7a6b5c4d-0000-4000-8000-000000000021",
  task_name: "Book the launch retro",
  task_label: "",
  task_status: "in_progress",
  task_priority: "medium",
  task_description: "<p>Retro.</p>",
  task_due_date: "0001-01-01T00:00:00Z",
  task_start_date: "0001-01-01T00:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_project: { project_uuid: PROJECT, project_name: "Q4 launch", project_is_admin: true, project_members: [] },
}

function cached(task?: typeof TASK) {
  const cache = new Map<string, unknown>()
  if (task) cache.set(`${GetEndpointUrl.GetTaskInfo}/${task.task_uuid}`, { data: { msg: "ok", data: task }, isLoading: false, isValidating: false })
  return cache
}

function wrap(cache: Map<string, unknown>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </Provider>
    )
  }
}

const SLOW = 30_000

afterEach(() => {
  cleanup()
  h.posts.length = 0
  h.axiosPosts.length = 0
  h.refuse.clear()
  h.readError = null
  h.params = {}
  h.path = "/app/project/p"
  h.toasts.length = 0
})

describe("a change the server refuses is taken back (PTC-2)", () => {
  it("Mark complete goes back to In progress when the server refuses it, with no uncaught error", async () => {
    h.refuse.add(PostEndpointUrl.UpdateTaskStatus)
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} />, { wrapper: wrap(cached(TASK)) })
    fireEvent.click(await screen.findByRole("button", { name: "Mark task as complete" }, { timeout: 10_000 }))
    expect(screen.getByRole("button", { name: "Task completed" })).toBeTruthy()
    await waitFor(() => expect(h.posts.some((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskStatus)).toBe(true), { timeout: 10_000 })
    expect(await screen.findByRole("button", { name: "Mark task as complete" }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Task completed" })).toBeNull()
  }, SLOW)

  it("Mark complete stays done when the server takes it", async () => {
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} />, { wrapper: wrap(cached(TASK)) })
    fireEvent.click(await screen.findByRole("button", { name: "Mark task as complete" }, { timeout: 10_000 }))
    // Done once the server has it, and still done after.
    await waitFor(() => expect(h.posts.some((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskStatus)).toBe(true), { timeout: 10_000 })
    expect(await screen.findByRole("button", { name: "Task completed" })).toBeTruthy()
  }, SLOW)
})

describe("a task that can't be read says why (PTC-4)", () => {
  it("says a task that isn't there is gone, with Close in the panel", async () => {
    h.readError = { response: { status: 404 } }
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} />, { wrapper: wrap(cached()) })
    expect(await screen.findByRole("heading", { name: "This task doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
    expect(screen.queryByText(/connection problem/)).toBeNull()
  }, SLOW)

  it("on the task's own page, offers the way back to My Tasks", async () => {
    h.readError = { response: { status: 404 } }
    h.params = { "task-id": TASK.task_uuid }
    render(<TaskPage />, { wrapper: wrap(cached()) })
    expect(await screen.findByRole("link", { name: "Back to My Tasks" })).toBeTruthy()
  }, SLOW)

  it("says a read that failed couldn't load, with Try again", async () => {
    h.readError = { response: { status: 503 } }
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} />, { wrapper: wrap(cached()) })
    expect(await screen.findByText("Couldn't load this task")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  }, SLOW)
})

describe("deleting a task offers Undo (PTC-24)", () => {
  it("deletes from the header's menu, says so with Undo, and stops offering to complete it", async () => {
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} />, { wrapper: wrap(cached(TASK)) })
    // Each step waits on what it needs, never on the clock: the delete's code
    // loads on first use, which under a loaded machine took past a fixed 300 ms.
    const more = await screen.findByRole("button", { name: "More task actions" }, { timeout: 10_000 })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete task/ }))
    await waitFor(() => expect(h.axiosPosts).toContain("bulk:delete"), { timeout: 10_000 })
    await waitFor(() => expect(h.toasts.find((t) => t.title === "Deleted “Book the launch retro”")?.action).toBeTruthy(), { timeout: 10_000 })
    expect(screen.queryByRole("button", { name: "Mark task as complete" })).toBeNull()
  }, SLOW)
})

describe("the browser tab says which task (PTC-38)", () => {
  it("names the task's own page after the task", async () => {
    h.params = { "task-id": TASK.task_uuid }
    h.path = `/app/task/${TASK.task_uuid}`
    render(
      <>
        <DocumentTitle />
        <TaskPage />
      </>,
      { wrapper: wrap(cached(TASK)) },
    )
    await waitFor(() => expect(document.title).toBe("Book the launch retro · OneCamp"), { timeout: 10_000 })
    // The composer sits under the work column, not across the sheet (PTC-45).
    await waitFor(() => expect(document.querySelector('[data-composer-frame="page"]')).not.toBeNull(), { timeout: 10_000 })
  }, SLOW)

  it("leaves the page beside a task's panel its own name", async () => {
    render(
      <>
        <DocumentTitle />
        <TaskInfoPanel taskUUID={TASK.task_uuid} />
      </>,
      { wrapper: wrap(cached(TASK)) },
    )
    // The panel is up (its status button shows) before the title is read.
    await screen.findByRole("button", { name: "Mark task as complete" }, { timeout: 10_000 })
    await waitFor(() => expect(document.title).toBe("Project · OneCamp"), { timeout: 10_000 })
    // In the side panel the composer is the panel's width.
    expect(document.querySelector("[data-composer-frame]")).toBeNull()
  }, SLOW)
})
