import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// A task with no dates comes from the server with no date fields at all: the
// task read is the graph's, whose dates are left out when unset (omitempty),
// as on a task an import made without them. The panel read the missing field
// as a date, Invalid Date, and the page fell to "Something broke" (RangeError:
// Invalid time value) where it should say the task has no dates.
const h = vi.hoisted(() => ({
  posts: [] as Array<{ apiEndpoint: string; payload: Record<string, unknown> }>,
  params: {} as Record<string, string>,
}))

vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: (req: { apiEndpoint: string; payload: Record<string, unknown> }) => {
      h.posts.push(req)
      return Promise.resolve({})
    },
    isSubmitting: false,
  }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: () => new Promise(() => {}), post: () => new Promise(() => {}), interceptors: { request: { use: () => 0 }, response: { use: () => 0 } } },
  // The panel's own reads (its Type row's picker) ask for no error toast.
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
  useParams: () => h.params,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
// The description's editor toolbar, as in components/textInput/noWriteOnOpen.test.tsx.
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { isZeroEpoch } = await import("@/lib/utils/validation/isZeroEpoch")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000002"
const UNDATED = {
  task_uuid: "7a6b5c4d-0000-4000-8000-000000000021",
  task_name: "Write the launch notes",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The notes.</p>",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_project: { project_uuid: PROJECT, project_name: "Launch", project_is_admin: true, project_members: [] },
}

function wrap() {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${UNDATED.task_uuid}`, { data: { msg: "ok", data: UNDATED }, isLoading: false, isValidating: false }]])
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

afterEach(cleanup)
// The task is written with dates (created 1 Oct, a date read on 24 Oct); read them against the suite's one today.
pinTestClock()

describe("a task the server sends without dates", () => {
  // The task writes dates (created, updated), so today is the suite's one day.
  pinTestClock()
  it("opens, and its Dates offer to add them", async () => {
    render(<TaskInfoPanel taskUUID={UNDATED.task_uuid} />, { wrapper: wrap() })
    await act(() => new Promise((r) => setTimeout(r, 300)))
    expect(screen.getByText("Write the launch notes")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Start date/ }).textContent).toContain("Add dates")
  }, 30_000)

  it("reads a date the server left out as none, as an empty or a zero one", () => {
    expect(isZeroEpoch(undefined)).toBe(true)
    expect(isZeroEpoch(null)).toBe(true)
    expect(isZeroEpoch("")).toBe(true)
    expect(isZeroEpoch("0001-01-01T00:00:00Z")).toBe(true)
    expect(isZeroEpoch("2026-10-24T09:00:00Z")).toBe(false)
  })
})
