import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// STEP4 #8, amended 17 Oct (DESIGN-BUILD-2): a task's own page shows its key
// once, as the path's last crumb, as the panel does (Linear: Team › ENG-123;
// Jira: Projects / X / KEY-1). A second copy above the title said it twice.
// The task is cached and the reads never answer, as in taskLabelNoWipe.test.tsx.

// The task's dates are written against a clock the test sets.
pinTestClock()

const h = vi.hoisted(() => ({ params: {} as Record<string, string> }))

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }) }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: () => new Promise(() => {}), post: () => new Promise(() => {}), interceptors: { request: { use: () => 0 }, response: { use: () => 0 } } },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/task/t",
  useParams: () => h.params,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))

const { default: store } = await import("@/store/store")
const { default: TaskPage } = await import("@/app/app/task/[task-id]/page")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const TASK = {
  task_uuid: "7a6b5c4d-0000-4000-8000-000000000021",
  task_key: "BIL-7",
  task_name: "Send the October invoices",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>All of them.</p>",
  task_due_date: "0001-01-01T00:00:00Z",
  task_start_date: "0001-01-01T00:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000002", project_name: "Billing", project_is_admin: true, project_members: [] },
}

function Wrapper({ children }: { children: ReactNode }) {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${TASK.task_uuid}`, { data: { msg: "ok", data: TASK }, isLoading: false, isValidating: false }]])
  return (
    <Provider store={store}>
      <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
        <TooltipProvider>{children}</TooltipProvider>
      </SWRConfig>
    </Provider>
  )
}

afterEach(() => {
  cleanup()
  h.params = {}
})

describe("a task's own page", () => {
  it("shows its key once, as the path's last crumb", async () => {
    h.params = { "task-id": TASK.task_uuid }
    render(<TaskPage />, { wrapper: Wrapper })
    await act(() => new Promise((r) => setTimeout(r, 300)))
    const crumb = await screen.findByRole("button", { name: "Copy key BIL-7" })
    expect(screen.getAllByText("BIL-7")).toEqual([crumb])
  }, 30_000)
})
