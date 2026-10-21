import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"

// PROJ-BUG-1 (P0, data loss). For a project admin, opening a task whose details
// were already cached (opened before in the session, prefetched for J then
// Enter, or the full task page) saved its tags as empty: the panel kept the
// tags in state that starts as "", and an effect saved that state's debounced
// copy, on mount too, before the stored tags were copied in. The server wrote
// "removed tags" to the history, and GitHub sync stripped the linked issue's
// labels. Every task here is cached before the panel mounts, as in those three
// ways in; the reads never answer, so what shows is the cache's.

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
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: () => new Promise(() => {}), post: () => new Promise(() => {}), interceptors: { request: { use: () => 0 }, response: { use: () => 0 } } },
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
const { default: TaskPage } = await import("@/app/app/task/[task-id]/page")
const { PostEndpointUrl, GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000001"
const task = (n: number, label: string) => ({
  task_uuid: `7a6b5c4d-0000-4000-8000-00000000001${n}`,
  task_name: `Refactor the invoice export ${n}`,
  task_label: label,
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The export.</p>",
  task_due_date: "0001-01-01T00:00:00Z",
  task_start_date: "0001-01-01T00:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [],
  task_project: { project_uuid: PROJECT, project_name: "Billing", project_is_admin: true, project_members: [] },
})
const A = task(1, "frontend, billing")
const B = task(2, "design")

/** A cache holding the tasks' details, as after an earlier open or a prefetch. */
function cachedWith(...tasks: ReturnType<typeof task>[]) {
  const cache = new Map<string, unknown>()
  // As SWR keeps an answered read: the data, no longer loading.
  for (const t of tasks) cache.set(`${GetEndpointUrl.GetTaskInfo}/${t.task_uuid}`, { data: { msg: "ok", data: t }, isLoading: false, isValidating: false })
  return cache
}

function wrap(cache: Map<string, unknown>) {
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

const labelPosts = () => h.posts.filter((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskLabel).map((p) => p.payload.task_label)
const namePosts = () => h.posts.filter((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskName).map((p) => p.payload.task_name)
// The whole panel mounts in each test: seconds on a loaded machine.
const SLOW = 30_000
// Past the half-second save delay, with room to spare.
const settle = () => act(() => new Promise((r) => setTimeout(r, 900)))

afterEach(() => {
  cleanup()
  h.posts.length = 0
  h.params = {}
})

describe("opening a task never saves its tags (PROJ-BUG-1)", () => {
  it("a task opened again, its details cached, posts no tags", async () => {
    const cache = cachedWith(A)
    const first = render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cache) })
    await settle()
    first.unmount()
    render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cache) })
    await settle()
    expect(screen.getByRole("button", { name: /^Labels: frontend, billing/ })).toBeTruthy()
    expect(labelPosts()).toEqual([])
  }, SLOW)

  it("J then Enter: the highlighted task, prefetched, opens with no tags posted; J again moves on with none", async () => {
    // The list prefetched the highlighted task (KeyboardList's TaskPrefetch),
    // so its details are cached when Enter opens it.
    const view = render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cachedWith(A, B)) })
    await settle()
    view.rerender(<TaskInfoPanel taskUUID={B.task_uuid} />)
    await settle()
    expect(labelPosts()).toEqual([])
  }, SLOW)

  it("the full task page (how a phone opens a task) posts no tags for a cached task", async () => {
    h.params = { "task-id": A.task_uuid }
    render(<TaskPage />, { wrapper: wrap(cachedWith(A)) })
    await settle()
    expect(screen.getByRole("button", { name: /^Labels: frontend, billing/ })).toBeTruthy()
    expect(labelPosts()).toEqual([])
  }, SLOW)

  it("never sends the name on open either", async () => {
    render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cachedWith(A)) })
    await settle()
    expect(namePosts()).toEqual([])
  }, SLOW)
})

describe("changing a task's tags", () => {
  const FIND = "Find or create a label…"
  async function openPicker() {
    if (!screen.queryByPlaceholderText(FIND)) fireEvent.click(screen.getByRole("button", { name: /^(Labels: .*Change labels|Add labels)$/ }))
    return screen.findByPlaceholderText(FIND)
  }
  /** Takes a tag the task has off, or puts one on, from the picker's list. */
  async function pick(tag: string) {
    await openPicker()
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(`^${tag}`) }))
  }
  /** Puts on a tag by typing it, as for one the list doesn't show. */
  async function type(tag: string) {
    fireEvent.change(await openPicker(), { target: { value: tag } })
    fireEvent.click(await screen.findByRole("option", { name: `Create “${tag}”` }))
  }

  it("posts once, with the new tags, half a second after the change", async () => {
    render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cachedWith(A)) })
    await settle()
    await pick("billing")
    expect(labelPosts()).toEqual([])
    await settle()
    expect(labelPosts()).toEqual(["frontend"])
    expect(h.posts.find((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskLabel)?.payload).toMatchObject({ task_uuid: A.task_uuid, task_project_uuid: PROJECT })
  }, SLOW)

  it("saves a change back to the tags it had, which the cached task still says", async () => {
    render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cachedWith(A)) })
    await settle()
    await pick("billing")
    await settle()
    await type("billing")
    await settle()
    expect(labelPosts()).toEqual(["frontend", "frontend, billing"])
  }, SLOW)

  it("saves a change still waiting when the panel closes, on the task it was made on", async () => {
    const view = render(<TaskInfoPanel taskUUID={A.task_uuid} />, { wrapper: wrap(cachedWith(A, B)) })
    await settle()
    await pick("billing")
    view.rerender(<TaskInfoPanel taskUUID={B.task_uuid} />)
    await settle()
    expect(h.posts.filter((p) => p.apiEndpoint === PostEndpointUrl.UpdateTaskLabel).map((p) => [p.payload.task_uuid, p.payload.task_label])).toEqual([[A.task_uuid, "frontend"]])
  }, SLOW)
})
