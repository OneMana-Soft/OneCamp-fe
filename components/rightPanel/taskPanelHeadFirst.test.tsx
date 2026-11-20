import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig, useSWRConfig } from "swr"
import { Profiler, useEffect, type ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

// fluid-18: opening a task waited on one commit that drew the whole panel
// (~2,260 renders) when /task/info answered, so the title painted only after
// every section had. The head (header, title) draws in the answer's commit;
// everything under the title mounts after that frame has painted, with
// nothing in its place before (step 3: a phone's status row drawn sooner was
// pushed down when the description took its place above it).
const h = vi.hoisted(() => ({
  desktop: true,
  answer: (_url: string): Promise<unknown> => new Promise(() => {}),
}))

vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({ makeRequest: () => Promise.resolve({}), isSubmitting: false }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (url: string) => h.answer(url),
    post: () => new Promise(() => {}),
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
  },
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/app/project/7a6b5c4d-0000-4000-8000-000000000052",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))
// The computer's right panel, or the phone's task page.
vi.mock("@/context/MediaQueryContext", () => ({
  useMedia: () => ({ isDesktop: h.desktop, isMobile: !h.desktop, isTablet: false }),
}))
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { bindAppMutate } = await import("@/lib/swrMutate")

const PROJECT = "7a6b5c4d-0000-4000-8000-000000000052"
const task = (n: number, name: string) => ({
  task_uuid: `7a6b5c4d-0000-4000-8000-00000000005${n}`,
  task_name: name,
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
  task_comments: [{ comment_uuid: `7a6b5c4d-0000-4000-8000-00000000006${n}`, comment_text: "<p>On it.</p>", comment_created_at: "2026-10-02T09:00:00Z" }],
  task_activities: [],
  task_project: { project_uuid: PROJECT, project_name: "Launch", project_is_admin: true, project_members: [] },
})
const FIRST = task(3, "Check the launch list")
const SECOND = task(4, "Book the launch venue")
const STATUSES = { built_in: [{ key: "todo", label: "To do" }, { key: "done", label: "Done" }], custom: [], colors: [], max: 10 }
const TIME = { entries: [], seconds: 5400, billable_seconds: 0, running: null }

// The task answers 150 ms after it is asked for, with its panel's parts, as the server does.
h.answer = (url: string) => {
  for (const t of [FIRST, SECOND])
    if (url.startsWith(`${GetEndpointUrl.GetTaskInfo}/${t.task_uuid}`))
      return new Promise((resolve) =>
        setTimeout(() => resolve({ data: { msg: "ok", data: structuredClone(t), included: { time_summary: { data: TIME }, statuses: { data: STATUSES } } } }), 150),
      )
  return new Promise(() => {})
}

function Bind() {
  const { mutate, cache } = useSWRConfig()
  bindAppMutate(mutate, cache)
  useEffect(() => () => bindAppMutate(null), [])
  return null
}

// The head's parts, and one marker for each section below it.
const HEAD = { header: "[data-task-header]" }
const SECTIONS = {
  status: '[data-property="status"]',
  dates: '[data-property="dates"]',
  description: "[data-task-description]",
  subtasks: "[data-subtasks]",
  commentBox: "[data-task-comment-box]",
}
type Shot = { commit: number; frame: number; title: string; head: string[]; sections: string[]; renders: number; under: number }

/** The elements drawn under the title: the body's after it, and the panel's after its scrolling body (a composer, a spacer). */
function drawnUnder(panel: Element): number {
  const body = panel.querySelector("[data-task-body]")
  let n = body ? body.children.length - 1 : 0
  for (let el = body?.parentElement?.nextElementSibling ?? null; el; el = el.nextElementSibling) n++
  return n
}

/** The components React drew under the panel's root element in the commit that created it (each one mounted then). */
function rendersUnder(el: Element): number {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"))
  const root = key ? (el as unknown as Record<string, { child: Fiber | null }>)[key] : undefined
  let count = 0
  const walk = (f: Fiber | null) => {
    for (let node = f; node; node = node.sibling) {
      if (node.type && typeof node.type !== "string") count++
      walk(node.child)
    }
  }
  walk(root?.child ?? null)
  return count
}
type Fiber = { type: unknown; child: Fiber | null; sibling: Fiber | null }

/**
 * Opens the panel and records each commit that shows a title: which head
 * parts and sections it holds, its renders when it is the panel's first, and
 * the frame it fell in (a frame counter of its own, ticking each frame).
 */
function open(uuid: string, cache: Map<string, { data?: unknown }>) {
  const shots: Shot[] = []
  let commit = 0
  let frame = 0
  let ticking = true
  const tick = () => {
    frame++
    if (ticking) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  let seen: Element | null = null
  const onRender = () => {
    commit++
    const panel = document.querySelector("[data-task-panel]")
    // The title is the body's first text: edited in place (a textarea), or read only.
    const title = panel?.querySelector("[data-task-body] textarea, [data-task-body] p.text-title-2")
    const text = title instanceof HTMLTextAreaElement ? title.value : (title?.textContent ?? "")
    if (!panel || !text) return
    const fresh = panel !== seen
    seen = panel
    shots.push({
      commit,
      frame,
      title: text,
      head: Object.entries(HEAD).filter(([, s]) => document.querySelector(s)).map(([k]) => k),
      sections: Object.entries(SECTIONS).filter(([, s]) => document.querySelector(s)).map(([k]) => k),
      renders: fresh ? rendersUnder(panel) : -1,
      under: drawnUnder(panel),
    })
  }
  const node = (id: string) => (
    <Profiler id="panel" onRender={onRender}>
      <TaskInfoPanel key={id} taskUUID={id} onPage={!h.desktop} />
    </Profiler>
  )
  const view = render(node(uuid), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
          <Bind />
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </Provider>
    ),
  })
  return {
    shots,
    switchTo: (id: string) => {
      shots.length = 0
      seen = null
      view.rerender(node(id))
    },
    stop: () => {
      ticking = false
    },
  }
}

// Time passes outside act: inside it React holds every update to the act's
// end and draws them in its own order, so a frame could not fall between two
// commits. Here React schedules as it does in a browser (accountSheetOpen
// does the same around one update).
const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms))

// What the head alone draws (the header's menus and buttons and the title: 68
// components on the computer, 116 on the phone's page; 114 and 162 with the
// status row) stays
// under this; the whole panel in the answer's one commit did not.
const HEAD_RENDERS = 250

beforeEach(() => {
  env.IS_REACT_ACT_ENVIRONMENT = false
})
afterEach(() => {
  cleanup()
  env.IS_REACT_ACT_ENVIRONMENT = true
  h.desktop = true
})

describe("opening a task draws its head first", () => {
  pinTestClock()

  for (const where of ["the computer's panel", "the phone's page"] as const) {
    it(`${where}: the commit that first shows the title holds the head alone, and the sections follow a painted frame later`, async () => {
      h.desktop = where === "the computer's panel"
      const view = open(FIRST.task_uuid, new Map())
      await settle(900)
      view.stop()
      const first = view.shots[0]
      expect(first, "a commit showing the title").toBeTruthy()
      // (a) header + title, no section and nothing else under the title (no
      // spacer standing in), renders under the ceiling.
      expect(first.title).toBe(FIRST.task_name)
      expect(first.head).toEqual(Object.keys(HEAD))
      expect(
        { sections: first.sections, under: first.under, overCeiling: first.renders >= HEAD_RENDERS },
        `the title's commit: sections ${first.sections.join(", ") || "none"}, ${first.under} drawn under the title, renders ${first.renders} (ceiling ${HEAD_RENDERS})`,
      ).toEqual({ sections: [], under: 0, overCeiling: false })
      // (b) every section mounts, in a later commit, after a frame has passed.
      const full = view.shots.find((s) => s.sections.length === Object.keys(SECTIONS).length)
      expect(full?.sections, "sections once the frame passed").toEqual(Object.keys(SECTIONS))
      expect(full!.commit).toBeGreaterThan(first.commit)
      expect(full!.frame, "a frame between the title and the sections").toBeGreaterThan(first.frame)
    }, 30_000)
  }

  it("a task switched to shows its own title, never the last one's, its head first again; opened again it shows it at once", async () => {
    const cache = new Map<string, { data?: unknown }>()
    const view = open(FIRST.task_uuid, cache)
    await settle(900)
    view.switchTo(SECOND.task_uuid)
    await settle(900)
    expect(view.shots.length).toBeGreaterThan(0)
    expect(view.shots.every((s) => s.title === SECOND.task_name), `titles after the switch: ${[...new Set(view.shots.map((s) => s.title))]}`).toBe(true)
    expect(view.shots[0].sections).toEqual([])
    expect(view.shots.at(-1)!.sections).toEqual(Object.keys(SECTIONS))
    // Back to the first: its answer is kept, so the title is in the very first commit, still ahead of the sections.
    view.switchTo(FIRST.task_uuid)
    expect(view.shots[0]?.title).toBe(FIRST.task_name)
    expect(view.shots[0].sections).toEqual([])
    await settle(900)
    view.stop()
    expect(view.shots.every((s) => s.title === FIRST.task_name)).toBe(true)
    expect(view.shots.at(-1)!.sections).toEqual(Object.keys(SECTIONS))
  }, 30_000)
})
