import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

import GuestProjectPage from "@/app/guest/p/[token]/page"

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
