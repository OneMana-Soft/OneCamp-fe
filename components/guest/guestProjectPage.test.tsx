import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { GuestProjectView, GuestTaskView } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

const getGuestProject = vi.fn<(token: string, refresh?: boolean) => Promise<PublicResult<GuestProjectView>>>()
const getGuestProjectTask = vi.fn<(token: string, id: string) => Promise<PublicResult<GuestTaskView>>>()
vi.mock("@/services/guestService", () => ({
  getGuestProject: (token: string, refresh?: boolean) => getGuestProject(token, refresh),
  getGuestProjectTask: (token: string, id: string) => getGuestProjectTask(token, id),
  commentOnGuestTask: vi.fn(),
  reviewGuestTask: vi.fn(),
}))
// The timeline view is beside the point here.
vi.mock("@/components/project/timeline/ProjectTimeline", () => ({ ProjectTimeline: () => null }))
const celebrateTask = vi.fn((_el: Element) => 8)
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element) => celebrateTask(el), prefersReducedMotion: () => true }))

import GuestProjectPage from "@/app/guest/p/[token]/page"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

const view: GuestProjectView = {
  project: "Acme website relaunch",
  can_comment: true,
  total_tasks: 1,
  done_tasks: 0,
  generated_at: "2026-10-10T08:00:00Z",
  updates: [],
  columns: [
    { status: "todo", label: "To do", tasks: [{ id: "t1", name: "Write the FAQ section", status: "todo", status_label: "To do", due_date: "2026-10-16", assignee: "Hana Kobayashi", comment_count: 0 }] },
  ],
} as unknown as GuestProjectView

const task = {
  id: "t1",
  name: "Write the FAQ section",
  status: "todo",
  status_label: "To do",
  due_date: "2026-10-16",
  start_date: "2026-10-12",
  assignee: "Hana Kobayashi",
  comment_count: 0,
  description: "Five questions clients ask most.",
  can_comment: true,
  comments: [],
} as unknown as GuestTaskView

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestProjectPage params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}
const openTask = () => act(async () => fireEvent.click(screen.getByRole("button", { name: /Write the FAQ section/ })))

describe("a client's task panel", () => {
  beforeEach(() => {
    // jsdom has no media queries: a wide window.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
    localStorage.clear()
    getGuestProject.mockReset().mockResolvedValue({ ok: true, data: view })
    getGuestProjectTask.mockReset()
  })
  afterEach(() => cleanup())

  it("says the task can't load yet, instead of spinning", async () => {
    getGuestProjectTask.mockResolvedValue({ ok: false, status: 503, msg: "" })
    await open()
    await openTask()
    const panel = screen.getByRole("complementary", { name: "Task" })
    expect(within(panel).getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
  })
})

describe("a client's task panel, once the task is in", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
    localStorage.clear()
    getGuestProject.mockReset().mockResolvedValue({ ok: true, data: view })
    getGuestProjectTask.mockReset().mockResolvedValue({ ok: true, data: task })
  })
  afterEach(() => cleanup())

  it("lays its details out as the team's task panel does: a quiet label, the value beside it", async () => {
    await open()
    await openTask()
    const panel = screen.getByRole("complementary", { name: "Task" })
    for (const label of ["Status", "Assignee", "Starts", "Due"]) {
      const el = within(panel).getByText(label)
      expect(el.className).toContain("text-muted-foreground")
      expect(el.className).toContain("whitespace-nowrap")
      expect(el.parentElement!.className).toContain("sm:grid-cols-[6.5rem_minmax(0,1fr)]")
    }
    expect(within(panel).getByText("Hana Kobayashi").className).not.toContain("text-muted-foreground")
  })

  it("keeps a half-written comment when Escape is pressed in it", async () => {
    localStorage.setItem("oc_guest_name_tok", "Jordan")
    await open()
    await openTask()
    const box = screen.getByRole("textbox", { name: "Write a comment" })
    box.focus()
    fireEvent.change(box, { target: { value: "The FAQ needs a pricing question" } })
    fireEvent.keyDown(box, { key: "Escape" })
    expect(screen.getByRole("complementary", { name: "Task" })).toBeInTheDocument()
    expect(box).not.toHaveFocus()
    // A second press, from outside the field, closes the panel.
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(screen.queryByRole("complementary", { name: "Task" })).not.toBeInTheDocument()
  })

  // Panels (one press, one thing: lib/keys/escape). Closing uses the press,
  // so a toast showing stays for the next one.
  it("closes on Escape as one press", async () => {
    await open()
    await openTask()
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    act(() => {
      document.body.dispatchEvent(esc)
    })
    expect(screen.queryByRole("complementary", { name: "Task" })).not.toBeInTheDocument()
    expect(esc.defaultPrevented, "the press was used").toBe(true)
  })

  it("has one filled button: the verdict, not the comment's send", async () => {
    localStorage.setItem("oc_guest_name_tok", "Jordan")
    await open()
    await openTask()
    const panel = screen.getByRole("complementary", { name: "Task" })
    const filled = within(panel).getAllByRole("button").filter((b) => /\bbg-brand\b/.test(b.className))
    expect(filled.map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Approve"])
  })

  it("closes with a cross on a wide screen", async () => {
    await open()
    await openTask()
    const close = screen.getByRole("button", { name: "Close the task" })
    expect(close.querySelector("svg.lucide-x")).not.toBeNull()
  })
})

describe("a client's project header", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
    getGuestProject.mockReset().mockResolvedValue({ ok: true, data: { ...view, total_tasks: 4, done_tasks: 1 } })
  })
  afterEach(() => cleanup())

  it("shows how far along it is as a ring with the count inside, named for screen readers (work.md W51)", async () => {
    await open()
    const ring = screen.getByRole("progressbar", { name: "1 of 4 tasks done" })
    expect(ring.querySelector("svg")).not.toBeNull()
    expect(ring).toHaveTextContent("1/4")
    expect(screen.getByText("Guest")).toBeInTheDocument()
    expect(document.querySelector("[data-project-tile='36']")).not.toBeNull()
  })
})

describe("what waits on the client (work.md W51)", () => {
  const inReview = {
    ...view,
    total_tasks: 2,
    columns: [
      { status: "todo", label: "To do", tasks: [view.columns[0].tasks[0]] },
      { status: "inReview", label: "In review", tasks: [{ id: "t2", name: "Pick the hero photo", status: "inReview", status_label: "In review", comment_count: 0 }] },
    ],
  } as unknown as GuestProjectView
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
    localStorage.clear()
    celebrateTask.mockClear()
    getGuestProject.mockReset().mockResolvedValue({ ok: true, data: inReview })
  })
  afterEach(() => cleanup())

  it("counts the tasks awaiting a verdict on their own tab", async () => {
    await open()
    const tab = screen.getByRole("tab", { name: /Needs your review/ })
    expect(tab).toHaveTextContent("1")
    await act(async () => fireEvent.click(tab))
    expect(screen.getByRole("button", { name: /Pick the hero photo/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Write the FAQ section/ })).toBeNull()
  })

  it("approves from the card once the guest has a name, with one celebration", async () => {
    localStorage.setItem("oc_guest_name_tok", "Priya")
    const { reviewGuestTask } = await import("@/services/guestService")
    vi.mocked(reviewGuestTask).mockResolvedValue({ ok: true, data: { decision: "approved", name: "Priya", created_at: "2026-10-11T08:00:00Z" } })
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })))
    expect(reviewGuestTask).toHaveBeenCalledWith("tok", "t2", { display_name: "Priya", decision: "approved", note: "" })
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })
})
