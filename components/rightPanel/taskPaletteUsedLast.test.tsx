import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type AxiosAdapter } from "axios"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"
import { offerPaletteEntries } from "@/lib/ui/paletteEntries"
import { forgetPaletteCode, loadPaletteSurfaces, paletteSurfaces } from "@/lib/ui/paletteSurfaces"

pinTestClock()

// linear-28: ⌘K acts on the task you're on. Two task panels can be open at
// once (the page, the right panel, a split pane), and the palette lists the
// newest "task" offer alone, so the panel the person used last must offer
// again: a press or a focus inside it does (CR-128 on CR-127's C1). Without
// that, ⌘K acts on the panel mounted last and can change the other task.

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
// The editors' toolbars, as in components/rightPanel/taskCommentAccess.test.tsx.
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

const TASK = "7a6b5c4d-0000-4000-8000-000000000043"
const NAME = "Review the launch checklist"
const NONE = "0001-01-01T00:00:00Z"
const task = {
  task_uuid: TASK,
  task_key: "LAU-43",
  task_name: NAME,
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
  task_access: { edit: false, delete: false, comment: true, log_time: false },
  task_project: { project_uuid: "7a6b5c4d-0000-4000-8000-000000000002", project_name: "Launch", project_is_member: true, project_members: [] },
}

// Every read but the cached task never answers: what shows is the task as the panel read it.
const adapter: AxiosAdapter = () => new Promise(() => {})

function Wrapper({ children }: { children: ReactNode }) {
  const cache = new Map<string, unknown>([[`${GetEndpointUrl.GetTaskInfo}/${TASK}`, { data: { msg: "ok", data: task }, isLoading: false, isValidating: false }]])
  return (
    <Provider store={store}>
      <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false }}>
        <TooltipProvider>{children}</TooltipProvider>
      </SWRConfig>
    </Provider>
  )
}

// The whole panel mounts in each test: seconds on a loaded machine.
const SLOW = 30_000

const stops: Array<() => void> = []
beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
})
afterEach(() => {
  cleanup()
  while (stops.length) stops.pop()!()
  forgetPaletteCode()
})

/** The one task the palette lists now: its actions' labels. */
const listedTask = () => paletteSurfaces().find((s) => s.id === "task")?.entries.map((e) => e.label)

/** Another panel, mounted later (a split pane's), offers its task: the newest offer is the one listed. */
function laterPanelOffers() {
  stops.push(
    offerPaletteEntries({
      id: "task",
      group: "This task",
      lead: true,
      entries: () => [{ id: "copy-link", label: "The other pane's link", keywords: [], run: vi.fn() }],
    }),
  )
  expect(listedTask()).toEqual(["The other pane's link"])
}

describe("the task panel the person used last is the task ⌘K acts on", () => {
  it(
    "offers its task again when pressed, after a panel mounted later offered its own",
    async () => {
      render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: Wrapper })
      const panel = (await screen.findAllByText(NAME))[0].closest("[data-task-panel]") as HTMLElement
      await act(async () => void (await loadPaletteSurfaces()))
      expect(listedTask()).toContain("Copy link")

      laterPanelOffers()
      act(() => void fireEvent.pointerDown(panel.querySelector("[data-task-properties]") ?? panel))
      expect(listedTask()).toContain("Copy link")
      expect(listedTask()).not.toContain("The other pane's link")
    },
    SLOW,
  )

  it(
    "offers its task again when something in it takes the focus, from the keyboard as much as a press",
    async () => {
      render(<TaskInfoPanel taskUUID={TASK} />, { wrapper: Wrapper })
      const panel = (await screen.findAllByText(NAME))[0].closest("[data-task-panel]") as HTMLElement
      await act(async () => void (await loadPaletteSurfaces()))

      laterPanelOffers()
      const button = panel.querySelector<HTMLElement>("button")
      expect(button).not.toBeNull()
      act(() => button!.focus())
      expect(listedTask()).toContain("Copy link")
      expect(listedTask()).not.toContain("The other pane's link")
    },
    SLOW,
  )
})
