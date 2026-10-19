import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A task's earlier history, paged from its panel, for a task the person can't
// open any more: it was deleted, or they left its project, while the panel was
// open. The server answers a task its caller may not read as one that isn't
// there (404), on its history as on every task route (Work Access, A1). The
// panel kept the task on screen, its "Show earlier history" failing each time;
// it now shows its can't-open state, as when it opens such a task.
//
// The reads go through the app's own API client, so a failed one is reported
// as every read is (the interceptor's tellReadFailure, lib/http/loadFailure):
// the can't-open state says it, so it raises no toast, and a failure nothing
// on screen explains raises one.

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => toasts.splice(toasts.indexOf(t), 1), update: () => undefined }
  }
  // The same answer on every render, as the real hook's: the panel's
  // callbacks depend on it, and a new one each time drew the panel for ever.
  const api = { toast, dismiss: () => undefined, toasts: [] }
  return { toast, useToast: () => api }
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
  useParams: () => ({}),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
// The description's editor toolbar, as in components/textInput/noWriteOnOpen.test.tsx.
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const TASK = "7a6b5c4d-0000-4000-8000-000000000031"
const task = {
  task_uuid: TASK,
  task_name: "Reconcile the March invoices",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The March run.</p>",
  task_due_date: "0001-01-01T00:00:00Z",
  task_start_date: "0001-01-01T00:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  // The newest line, and older ones to ask for.
  task_activities: [
    {
      activity_uuid: "a-5",
      activity_by: { user_uuid: "5a110000-0000-4000-8000-000000000001", user_name: "Ada", user_profile_object_key: "" },
      activity_type: "statusUpdate",
      activity_time: "2026-10-01T09:05:00Z",
      activity_prev_state: "todo",
      activity_next_state: "inProgress",
    },
  ],
  task_activity_has_more: true,
  task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000001", project_name: "Billing", project_is_member: true, project_members: [] },
}

/** How a page of earlier history answers: a status the server fails with. */
let historyStatus = 404
/** The server: a page of earlier history fails with historyStatus; every other read never answers, so what shows is the cached task. */
const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  if (!String(config.url).includes(`${GetEndpointUrl.GetTaskActivityList}/`)) return new Promise(() => {})
  const response = { status: historyStatus, statusText: "", data: { msg: "the task isn't there" }, headers: {}, config }
  return Promise.reject(new AxiosError(`Request failed with status code ${historyStatus}`, "ERR_BAD_REQUEST", config, null, response))
}

/** A cache holding the task's details, as after the panel read them. */
function wrap() {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${TASK}`, { data: { msg: "ok", data: task }, isLoading: false, isValidating: false }]])
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
// Started after a read failed, this ends after the read's toast was due:
// timers run in the order they fall due.
const pastTheBeat = () => act(() => new Promise((r) => setTimeout(r, READ_FAILURE_BEAT_MS + 150)))

async function askForEarlier(status: number) {
  historyStatus = status
  render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: wrap() })
  await settle()
  expect(document.querySelector("[data-task-panel]")).not.toBeNull()
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show earlier history" })))
  await settle()
  await pastTheBeat()
}

beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
  toasts.length = 0
})
afterEach(cleanup)

describe("earlier history for a task the person can't open any more", () => {
  it("shows the panel's can't-open state in place of the task when a page answers 404, and no toast", async () => {
    await askForEarlier(404)
    expect(screen.getByRole("heading", { name: "This task doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
    // Not the task, and not a history list that can't go on.
    expect(document.querySelector("[data-task-panel]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Show earlier history" })).toBeNull()
    // The read was reported, and the screen says it: nothing more.
    expect(toasts).toEqual([])
  }, SLOW)

  it("says the task isn't theirs to see when a server from before roles answers 403, and no toast", async () => {
    await askForEarlier(403)
    expect(screen.getByRole("heading", { name: "You can't see this task" })).toBeTruthy()
    expect(document.querySelector("[data-task-panel]")).toBeNull()
    expect(toasts).toEqual([])
  }, SLOW)

  it("keeps the task, and the button for another try, when a page fails for another reason, and says so in a toast", async () => {
    await askForEarlier(503)
    expect(document.querySelector("[data-task-panel]")).not.toBeNull()
    expect(document.querySelector("[data-load-failure]")).toBeNull()
    expect(screen.getByRole("button", { name: "Show earlier history" })).toBeEnabled()
    // Nothing on screen explains it, so the read's toast does, once.
    expect(toasts).toHaveLength(1)
  }, SLOW)
})
