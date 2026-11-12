import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// A sub-task whose parent the reader may not see (V-678): the server sends the
// parent as a stub, task_hidden and nothing else, no name and no id. The panel
// read a parent from its id, so the stub's "A task you can't see" left the
// task's path, and the sub-task was taken for a top-level task (its
// dependencies offered, its repeat too).
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
const { HIDDEN_TASK_NAME } = await import("@/lib/work/hiddenTask")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000092"
const task = (uuid: string, over: Record<string, unknown> = {}) => ({
  task_uuid: uuid,
  task_name: "Draft the pay bands",
  task_label: "",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The bands.</p>",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_project: { project_uuid: PROJECT, project_name: "Q4 launch", project_is_admin: true, project_members: [] },
  ...over,
})

function open(t: { task_uuid: string }) {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${t.task_uuid}`, { data: { msg: "ok", data: t }, isLoading: false, isValidating: false }]])
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

describe("a sub-task whose parent the reader can't see", () => {
  pinTestClock()

  it("names the parent in its path, with no way into it, and is a sub-task: no dependencies, no repeat", async () => {
    // The stub exactly as the server sends it: no task_uuid, no task_name.
    await open(task("7a6b5c4d-0000-4000-8000-000000000093", { task_parent_task: { task_hidden: true } }))
    const path = screen.getByRole("navigation", { name: "Where this task sits" })
    const parent = path.querySelector<HTMLElement>("[data-hidden-task]")
    expect(parent, "the hidden parent's step in the path").not.toBeNull()
    expect(parent!.textContent).toContain(HIDDEN_TASK_NAME)
    expect(within(path).queryByRole("button", { name: /the task this one is part of/ })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Dependencies" })).toBeNull()
    // A sub-task repeats only if it already did (TaskRepeatField): this one never did, so it has no repeat row.
    expect(screen.queryByText("Doesn't repeat")).toBeNull()
  }, 30_000)

  it("a top-level task has no parent in its path, and its dependencies and repeat", async () => {
    await open(task("7a6b5c4d-0000-4000-8000-000000000094"))
    const path = screen.getByRole("navigation", { name: "Where this task sits" })
    expect(path.querySelector("[data-hidden-task]")).toBeNull()
    expect(screen.getByRole("heading", { name: "Dependencies" })).toBeTruthy()
    expect(screen.getByText("Doesn't repeat")).toBeTruthy()
  }, 30_000)
})
