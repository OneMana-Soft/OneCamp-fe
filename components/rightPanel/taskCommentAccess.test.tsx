import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { type AxiosAdapter } from "axios"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A project's viewers read its tasks but can't comment on them (Work Access,
// A1): the server refuses their comment ("You can see this project but not
// comment in it."). The task panel offered them the comment box anyway, and
// what they typed was refused on Send. It now says so quietly in the box's
// place, from the task's own task_access; members and commenters keep the box.

vi.mock("@/hooks/use-toast", () => {
  const api = { toast: () => ({ id: "1", dismiss: () => undefined, update: () => undefined }), dismiss: () => undefined, toasts: [] }
  return { toast: api.toast, useToast: () => api }
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
  useParams: () => ({}),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
// The editors' toolbars, as in components/rightPanel/taskHistoryCantOpen.test.tsx.
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const TASK = "7a6b5c4d-0000-4000-8000-000000000041"
const NONE = "0001-01-01T00:00:00Z"
const NOTE = "You can see this project but not comment in it."

const taskFor = (comment: boolean) => ({
  task_uuid: TASK,
  task_name: "Review the launch checklist",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>Before Friday.</p>",
  task_due_date: NONE,
  task_start_date: NONE,
  task_deleted_at: NONE,
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_activities: [],
  task_access: { edit: false, delete: false, comment, log_time: false },
  task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000002", project_name: "Launch", project_is_member: true, project_members: [] },
})

// Every read but the cached task never answers: what shows is the task as the panel read it.
const adapter: AxiosAdapter = () => new Promise(() => {})

function wrap(comment: boolean) {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${TASK}`, { data: { msg: "ok", data: taskFor(comment) }, isLoading: false, isValidating: false }]])
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </Provider>
    )
  }
}

// The whole panel mounts in each test: seconds on a loaded machine.
const SLOW = 30_000
const settle = () => act(() => new Promise((r) => setTimeout(r, 300)))

beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
})
afterEach(cleanup)

describe("the comment box on a task", () => {
  it("is a quiet line for someone who can read the task but not comment on it", async () => {
    render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: wrap(false) })
    await settle()
    expect(document.querySelector("[data-task-panel]")).not.toBeNull()
    expect(screen.getByText(NOTE)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
    expect(document.querySelector("[data-task-comment-box]")).toBeNull()
  }, SLOW)

  it("is the box for someone who may comment, with no line", async () => {
    render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: wrap(true) })
    await settle()
    expect(document.querySelector("[data-task-comment-box]")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy()
    expect(screen.queryByText(NOTE)).toBeNull()
  }, SLOW)
})
