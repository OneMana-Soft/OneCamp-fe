import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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
const LATER = "You can change and comment on it when you're back online."
const ADA = { user_uuid: "5a110000-0000-4000-8000-000000000001", user_name: "Ada", user_profile_object_key: "" }
// One comment, with Ada's 👍 on it.
const COMMENT = {
  comment_uuid: "c0000000-0000-4000-8000-000000000001",
  comment_text: "<p>Totals match.</p>",
  comment_by: ADA,
  comment_created_at: "2026-10-01T09:10:00Z",
  comment_reactions: [{ uid: "0x51", reaction_emoji_id: "+1", reaction_added_by: ADA, reaction_added_at: "2026-10-01T09:11:00Z", reaction_on_content_added_by: ADA }],
}

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
  task_comments: [COMMENT],
  task_activities: [],
  task_access: { edit: false, delete: false, comment, log_time: false },
  task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000002", project_name: "Launch", project_is_member: true, project_members: [] },
})

// Every read but the cached task never answers: what shows is the task as the panel read it.
const adapter: AxiosAdapter = () => new Promise(() => {})

function wrap(comment: boolean, id = TASK, task: Record<string, unknown> = taskFor(comment)) {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${id}`, { data: { msg: "ok", data: task }, isLoading: false, isValidating: false }]])
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

  // CR-81 MF3 (asana-12): a task made on this device with no network, whose project's access the device never kept.
  // Nothing makes that access up (lib/offline/tasks withKeptProject), and the page never calls the member's own task
  // view-only: it says calmly that it can be changed once they're back online.
  it("says a task made here can be changed once back online, when the device holds no access for its project", async () => {
    const MADE = "offline-7a6b5c4d-0000-4000-8000-000000000099"
    const made = { ...taskFor(false), task_uuid: MADE, task_access: undefined, task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000002", project_name: "Launch", project_members: [] } }
    render(<TaskInfoPanel taskUUID={MADE} />, { wrapper: wrap(false, MADE, made) })
    await settle()
    expect(screen.queryByText(NOTE)).toBeNull()
    expect(screen.getByText(LATER)).toBeTruthy()
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

// Reacting to a task's comments asks what commenting asks (NeedComment): a
// reader who may not comment sees who reacted, and has nothing to press.
describe("reactions on a task's comments", () => {
  const hoverComment = async () => {
    const row = (await screen.findByText("Totals match.")).closest("[data-message-row]")
    expect(row).not.toBeNull()
    fireEvent.pointerEnter(row!)
  }

  it("say who reacted to someone who can read the task but not comment on it, and offer no way to react", async () => {
    render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: wrap(false) })
    await settle()
    const pill = await screen.findByRole("button", { name: /1 person/ })
    expect(pill.getAttribute("aria-disabled")).toBe("true")
    expect(pill.getAttribute("aria-label")).not.toMatch(/your reaction/)
    expect(pill.className).not.toMatch(/\b(hover|active):/)
    expect(screen.queryByRole("button", { name: "Add a reaction" })).toBeNull()
    await hoverComment()
    expect(screen.queryByRole("button", { name: /^React with/ })).toBeNull()
  }, SLOW)

  it("let someone who may comment react, from the pill, the add button and the row's quick reactions", async () => {
    render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: wrap(true) })
    await settle()
    const pill = await screen.findByRole("button", { name: /1 person/ })
    expect(pill.getAttribute("aria-disabled")).toBeNull()
    expect(pill.getAttribute("aria-label")).toMatch(/Add your reaction/)
    expect(screen.getAllByRole("button", { name: "Add a reaction" }).length).toBeGreaterThan(0)
    await hoverComment()
    expect((await screen.findAllByRole("button", { name: /^React with/ })).length).toBeGreaterThan(0)
  }, SLOW)
})
