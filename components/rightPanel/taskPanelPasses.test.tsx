import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig, useSWRConfig } from "swr"
import { useEffect, type ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// V-1099: a phone opening a task's page drew the panel's whole body four
// times after the task's answer (1784 renders at 4x against a budget of 1370):
// once for the answer, once more from an effect that copied the answer into
// state, and once more as that effect's comments reached the store. The body
// draws once for the answer, and once more only as its deferred rows come in
// (settled, a frame after it opened).
const h = vi.hoisted(() => ({
  draws: [] as Array<string | undefined>,
  gets: [] as string[],
  answered: [] as string[],
  answer: (_url: string): Promise<unknown> => new Promise(() => {}),
  // What the next answers change of the task (a change someone else made).
  change: {} as Record<string, unknown>,
}))

// Only the panel names the page, once in each draw of its body: one call is
// one draw.
vi.mock("@/lib/utils/pageName", async (orig) => ({
  ...(await orig<object>()),
  usePageName: (name: string | undefined) => {
    h.draws.push(name)
  },
}))
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (url: string) => {
      h.gets.push(url)
      return h.answer(url)
    },
    post: () => new Promise(() => {}),
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
  },
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/app/task/7a6b5c4d-0000-4000-8000-000000000031",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))
// The phone's path: the task opens as its own page.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true, isTablet: false }) }))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { ChatGet } = await import("@/services/endpoints/chat")
const { projectStatusesKey } = await import("@/lib/projectStatusesKey")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { appMutate, bindAppMutate } = await import("@/lib/swrMutate")
const { markSeeded } = await import("@/lib/swrSeed")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000032"
const TASK = {
  task_uuid: "7a6b5c4d-0000-4000-8000-000000000031",
  task_name: "Check the launch list",
  task_label: "launch",
  task_status: "todo",
  task_priority: "medium",
  task_description: "<p>The list.</p>",
  task_start_date: "2026-10-01T09:00:00Z",
  task_due_date: "2026-10-09T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_created_at: "2026-10-01T09:00:00Z",
  task_sub_tasks: [],
  task_attachments: [],
  task_comments: [
    { comment_uuid: "7a6b5c4d-0000-4000-8000-000000000033", comment_text: "<p>On it.</p>", comment_created_at: "2026-10-02T09:00:00Z" },
  ],
  task_activities: [],
  task_project: { project_uuid: PROJECT, project_name: "Launch", project_is_admin: true, project_members: [] },
}
const STATUSES = { built_in: [{ key: "todo", label: "To do" }, { key: "done", label: "Done" }], custom: [], colors: [], max: 10 }
const TIME = { entries: [], seconds: 5400, billable_seconds: 0, running: null }

// The task answers with its panel's parts (?include=), as the server does,
// each time a new object, as a parsed answer is;
// each part settles under its own read's key after the task's answer. A part
// left out is read on its own.
function later(url: string, ms: number, data: unknown) {
  return new Promise((resolve) =>
    setTimeout(() => {
      h.answered.push(url)
      resolve({ data })
    }, ms),
  )
}
// A task a list already read for its row's press, without the panel's parts
// (the walk's way in): its page draws at once from that, then its own read.
const KEPT = {
  ...TASK,
  task_uuid: "7a6b5c4d-0000-4000-8000-000000000034",
  task_name: "Book the launch venue",
  task_comments: [
    { comment_uuid: "7a6b5c4d-0000-4000-8000-000000000035", comment_text: "<p>Two to see.</p>", comment_created_at: "2026-10-03T09:00:00Z" },
  ],
}
// A task in another project, read without its parts: what a seeded part
// leaves fresh (markSeeded) is the other two's.
const LATE_PROJECT = "7a6b5c4d-0000-4000-8000-000000000037"
const LATE = { ...TASK, task_uuid: "7a6b5c4d-0000-4000-8000-000000000036", task_project: { ...TASK.task_project, project_uuid: LATE_PROJECT } }
// A task with older history to ask for, and the page that answers it.
const HIST = { ...TASK, task_uuid: "7a6b5c4d-0000-4000-8000-000000000038", task_activities: [{ activity_uuid: "a-5", activity_by: { user_uuid: "5a110000-0000-4000-8000-000000000001", user_name: "Ada", user_profile_object_key: "" }, activity_type: "statusUpdate", activity_time: "2026-10-01T09:05:00Z", activity_prev_state: "todo", activity_next_state: "inProgress" }], task_activity_has_more: true }
const EARLIER = [{ activity_uuid: "a-4", activity_by: { user_uuid: "5a110000-0000-4000-8000-000000000001", user_name: "Ada", user_profile_object_key: "" }, activity_type: "statusUpdate", activity_time: "2026-10-01T09:04:00Z", activity_prev_state: "inProgress", activity_next_state: "todo" }]
h.answer = (url: string) => {
  if (url.startsWith(`${ChatGet.GetTaskActivityList}/${HIST.task_uuid}?`)) return later(url, 200, { data: { task_activities: EARLIER, task_activity_has_more: false } })
  for (const task of [TASK, KEPT, LATE, HIST])
    if (url.startsWith(`${GetEndpointUrl.GetTaskInfo}/${task.task_uuid}`)) return later(url, 200, { msg: "ok", data: { ...structuredClone(task), ...h.change }, included: task === LATE ? {} : { time_summary: { data: TIME }, statuses: { data: STATUSES } } })
  if ([TASK, KEPT, LATE].some((task) => url === `${GetEndpointUrl.TaskTime}/${task.task_uuid}`)) return later(url, url.endsWith(LATE.task_uuid) ? 860 : 260, { data: TIME })
  if (url === projectStatusesKey(PROJECT) || url === projectStatusesKey(LATE_PROJECT)) return later(url, url === projectStatusesKey(LATE_PROJECT) ? 920 : 320, { data: STATUSES })
  return new Promise(() => {})
}

// The app's mutate is bound to its cache (ClientProviders), so seeded parts land where the hooks read.
function Bind() {
  const { mutate, cache } = useSWRConfig()
  bindAppMutate(mutate, cache)
  useEffect(() => () => bindAppMutate(null), [])
  return null
}

function wrap(cache: Map<string, { data?: unknown }>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
          <Bind />
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </Provider>
    )
  }
}

afterEach(cleanup)

describe("a task's page on a phone", () => {
  pinTestClock()
  it("draws its body at most twice after the task's answer, however many reads settle after it", async () => {
    const cache = new Map<string, { data?: unknown }>()
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} onPage />, { wrapper: wrap(cache) })
    await act(() => new Promise((r) => setTimeout(r, 900)))
    expect(screen.getAllByText("Check the launch list").length).toBeGreaterThan(0)
    // The parts that settle after the answer did settle, so the count below
    // covers them.
    expect(h.answered).toEqual([expect.stringContaining(`${GetEndpointUrl.GetTaskInfo}/${TASK.task_uuid}`)])
    expect(cache.get(`${GetEndpointUrl.TaskTime}/${TASK.task_uuid}`)?.data).toEqual({ data: TIME })
    expect(cache.get(projectStatusesKey(PROJECT))?.data).toEqual({ data: STATUSES })
    const afterAnswer = h.draws.filter((name) => name === TASK.task_name).length
    expect(afterAnswer, `body draws after the answer: ${afterAnswer}`).toBeLessThanOrEqual(2)
  }, 30_000)

  it("draws nothing more of its body as its time and its project's statuses settle after the answer", async () => {
    // A task read without its parts (an older server, or a part left out):
    // its time and its project's statuses are read on their own, well after it.
    const cache = new Map<string, { data?: unknown }>()
    render(<TaskInfoPanel taskUUID={LATE.task_uuid} onPage />, { wrapper: wrap(cache) })
    await act(() => new Promise((r) => setTimeout(r, 500)))
    expect(screen.getAllByText("Check the launch list").length).toBeGreaterThan(0)
    expect(cache.get(projectStatusesKey(LATE_PROJECT))?.data).toBeUndefined()
    const draws = h.draws.length
    await act(() => new Promise((r) => setTimeout(r, 1200)))
    // Both were read on their own and answered.
    expect(h.answered).toEqual(expect.arrayContaining([`${GetEndpointUrl.TaskTime}/${LATE.task_uuid}`, projectStatusesKey(LATE_PROJECT)]))
    // Each settles in the row that shows it, not in the whole body.
    expect(h.draws.length - draws, "body draws as its time and statuses settle").toBe(0)
  }, 30_000)

  it("draws nothing more of its body as an earlier page of its history comes in", async () => {
    const cache = new Map<string, { data?: unknown }>()
    render(<TaskInfoPanel taskUUID={HIST.task_uuid} onPage />, { wrapper: wrap(cache) })
    await act(() => new Promise((r) => setTimeout(r, 900)))
    const draws = h.draws.length
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show earlier history" })))
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(h.answered).toContainEqual(expect.stringContaining(`${ChatGet.GetTaskActivityList}/${HIST.task_uuid}?`))
    // The page came in, and there is nothing older to ask for.
    expect(screen.queryByRole("button", { name: "Show earlier history" })).toBeNull()
    expect(h.draws.length - draws, "body draws as an earlier page comes in").toBe(0)
  }, 30_000)

  it("draws nothing more for a re-read that brings the same task", async () => {
    const cache = new Map<string, { data?: unknown }>()
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} onPage />, { wrapper: wrap(cache) })
    await act(() => new Promise((r) => setTimeout(r, 900)))
    const reads = h.answered.length
    const draws = h.draws.length
    // As the 5-minute refresh, a focus, or the live topic's catch-up reads it,
    // a minute on: the clock moves, as a phone's does.
    vi.setSystemTime(new Date(Date.now() + 60_000))
    await act(async () => {
      await appMutate(`${GetEndpointUrl.GetTaskInfo}/${TASK.task_uuid}`)
      await new Promise((r) => setTimeout(r, 400))
    })
    expect(h.answered.length).toBe(reads + 1)
    expect(h.draws.length - draws, "draws after a re-read with the same task").toBe(0)
  }, 30_000)

  it("draws once for a re-read that brings a change, not once more for its comments", async () => {
    const cache = new Map<string, { data?: unknown }>()
    render(<TaskInfoPanel taskUUID={TASK.task_uuid} onPage />, { wrapper: wrap(cache) })
    await act(() => new Promise((r) => setTimeout(r, 900)))
    const draws = h.draws.length
    // Someone else moved it on: the live topic's catch-up reads it again, its
    // comments as they were (each a new object, as a parsed answer's are).
    h.change = { task_status: "done" }
    vi.setSystemTime(new Date(Date.now() + 60_000))
    try {
      await act(async () => {
        await appMutate(`${GetEndpointUrl.GetTaskInfo}/${TASK.task_uuid}`)
        await new Promise((r) => setTimeout(r, 400))
      })
    } finally {
      h.change = {}
    }
    expect(h.draws.length - draws, "draws after a re-read with a change").toBe(1)
  }, 30_000)

  it("draws a task a list already read at once, with its comments, and nothing more for its read", async () => {
    // As a list's prefetch keeps it (KeyboardList's TaskPrefetch): the task with
    // its parts, each part under its own read's key. Its comments aren't in the store.
    const cache = new Map<string, { data?: unknown }>()
    // (Each as a read leaves it: answered, nothing loading.)
    const kept = (data: unknown) => ({ data, isLoading: false, isValidating: false })
    cache.set(`${GetEndpointUrl.GetTaskInfo}/${KEPT.task_uuid}`, kept({ msg: "ok", data: structuredClone(KEPT), included: { time_summary: { data: TIME }, statuses: { data: STATUSES } } }))
    for (const [key, data] of [[`${GetEndpointUrl.TaskTime}/${KEPT.task_uuid}`, { data: TIME }], [projectStatusesKey(PROJECT), { data: STATUSES }]] as const) {
      cache.set(key, kept(data))
      markSeeded(key)
    }
    const draws = () => h.draws.filter((name) => name === KEPT.task_name).length
    render(<TaskInfoPanel taskUUID={KEPT.task_uuid} onPage />, { wrapper: wrap(cache) })
    const opened = draws()
    await act(() => new Promise((r) => setTimeout(r, 900)))
    expect(h.answered).toContainEqual(expect.stringContaining(`${GetEndpointUrl.GetTaskInfo}/${KEPT.task_uuid}`))
    expect(store.getState().createTaskComment.taskComments[KEPT.task_uuid]?.length).toBe(1)
    // Once its deferred rows come in, and nothing for its comments or its read.
    const after = draws() - opened
    expect(after, `body draws after opening (${opened} on opening): ${after}`).toBeLessThanOrEqual(1)
  }, 30_000)
})
