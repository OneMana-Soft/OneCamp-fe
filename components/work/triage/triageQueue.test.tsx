import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { today } from "@/lib/work/triageRota"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"

/**
 * A project's triage queue (linear-21 H3, on H1's GET /project/{id}/triage and POST
 * /task/triage/{task}/decide): rows with where each came from, who asked and how long it has
 * waited; J and K move, X selects, 1 accepts, 2 declines with a reason, 3 marks a duplicate of a
 * task picked with the house picker, H snoozes (later.ts's choices), P sets a priority. Each
 * decision moves the focus to the next row; a refused one (403, 409) shows the server's words and
 * leaves the row where it was.
 */
const h = vi.hoisted(() => ({ offline: false, sheet: false }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useStore: () => ({ getState: () => ({ split: { active: -1 }, rightPanel: { rightPanelState: { isOpen: false, data: {} } } }), subscribe: () => () => {} }),
  useSelector: () => undefined,
}))
vi.mock("@/lib/connectivity", async (actual) => ({ ...(await actual<object>()), isAppOffline: () => h.offline, subscribeConnectivity: () => () => {} }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => h.sheet }))

const { default: TriageQueue } = await import("@/components/work/triage/TriageQueue")

// Each test its own project: a lazy view's reads are kept by path while the page lives (lib/lazy/useKeptRead).
let n = 0
const req = (id: string, name: string, more: Record<string, unknown> = {}) => ({
  task_uuid: id, project_uuid: "p", source: "form", requester_name: "Asha Rao", requester_email: "asha@example.com",
  arrived_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), name, status: "todo", ...more,
})
const refusal = (status: number, msg: string) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data: { msg } } })

function setup({ requests = [req("t1", "Printer on 3 is jammed"), req("t2", "VPN drops at noon", { source: "api", requester_name: "", requester_email: "" }), req("t3", "New laptop for Ravi")], canDecide = true, canManage = false, fail, refuse, rota }: {
  requests?: ReturnType<typeof req>[]
  canDecide?: boolean
  canManage?: boolean
  fail?: unknown
  refuse?: Record<string, unknown>
  rota?: { people: string[]; weeks: number; start: string; on_duty: string; next_change: string }
} = {}) {
  const P = `p${++n}`
  let waiting = [...requests]
  const posts: { url: string; body: Record<string, unknown> }[] = []
  const get = vi.fn(async (url: string) => {
    if (fail) throw fail
    if (url.endsWith("/triage/rota")) return { data: { msg: "ok", data: { rota: rota ?? { people: [], weeks: 1, start: "", on_duty: "", next_change: "" }, can_manage: canManage } } }
    if (url.startsWith("/project/memberWithAdminFlag/")) return { data: { msg: "ok", data: { project_members: [{ user_uuid: "ana", user_name: "Ana Ruiz", user_full_name: "Ana Ruiz" }] } } }
    if (url.includes("/timeline")) return { data: { data: { tasks: [{ task_uuid: "orig", task_name: "Printer jams (the first report)", task_status: "todo" }] } } }
    return { data: { msg: "ok", data: { on: true, requests: waiting, can_decide: canDecide } } }
  })
  const post = vi.fn(async (url: string, body?: unknown) => {
    posts.push({ url, body: body as Record<string, unknown> })
    const id = url.split("/")[3]
    if (refuse?.[id]) {
      const r = refuse[id]
      delete refuse[id]
      throw r
    }
    if (url.endsWith("/decide") && (body as { decision: string }).decision !== "snooze") waiting = waiting.filter((r) => r.task_uuid !== id)
    return { data: { msg: "Decided." } }
  })
  const mutate = vi.fn(async () => undefined)
  const calls = { http: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, quiet: {}, mutate, policies: `/project/${P}/policies`, confirm: vi.fn() } as unknown as ProjectCalls
  const onSettings = vi.fn()
  render(
    <TriageQueue
      projectId={P}
      calls={calls}
      canManage={canManage}
      onSettings={onSettings}
      statuses={[{ value: "todo", label: "To do" }, { value: "in_progress", label: "In progress" }]}
      failed={(retry, detail) => <div role="alert" data-testid="failed">{detail ?? "failed"}<button type="button" onClick={retry}>Try again</button></div>}
      empty={(s) => <div data-testid="empty"><p>{s.title}</p><p>{s.description}</p></div>}
      loading={<div data-testid="loading" />}
    />,
  )
  return { posts, get, mutate, onSettings, P }
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
const lit = () => document.querySelector<HTMLElement>("[data-task-id][data-highlighted]")?.dataset.taskId
const key = (k: string) => fireEvent.keyDown(lit() ? row(lit()!)! : document.body, { key: k })

afterEach(() => {
  cleanup()
  h.offline = false
  h.sheet = false
})

describe("the triage queue's rows", () => {
  it("say what waits, where it came from, who asked and how long ago, with the first row lit", async () => {
    setup()
    await waitFor(() => expect(row("t1")).not.toBeNull())
    const first = row("t1")!
    expect(first.textContent).toContain("Printer on 3 is jammed")
    expect(first.textContent).toMatch(/form/i)
    expect(first.textContent).toContain("Asha Rao")
    expect(first.textContent).toMatch(/3 h/)
    // A request with no requester (the API's) says where it came from alone.
    expect(row("t2")!.textContent).toMatch(/API/)
    expect(lit()).toBe("t1")
    // The Triage pill beside the status (DECISION-L21 1: a mark, never a status value).
    expect(within(first).getByText("Triage")).toBeTruthy()
  })
})

describe("the triage queue's keys", () => {
  it("J and K move, X selects", async () => {
    setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    key("j")
    expect(lit()).toBe("t2")
    key("j")
    expect(lit()).toBe("t3")
    key("k")
    expect(lit()).toBe("t2")
    key("x")
    expect(row("t2")!.getAttribute("aria-selected")).toBe("true")
  })

  it("1 accepts the lit row as it is and lights the next", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("1"))
    await waitFor(() => expect(row("t1")).toBeNull())
    expect(posts[0]).toEqual({ url: "/task/triage/t1/decide", body: { decision: "accept" } })
    expect(lit()).toBe("t2")
  })

  it("2 declines only with a reason, then the next row is lit", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("2"))
    const dialog = await screen.findByRole("dialog", { name: /Decline/ })
    const send = within(dialog).getByRole("button", { name: "Decline" })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Why/ }), { target: { value: "Facilities handles printers" } })
    expect((send as HTMLButtonElement).disabled).toBe(false)
    await act(async () => void fireEvent.click(send))
    await waitFor(() => expect(row("t1")).toBeNull())
    expect(posts[0]).toEqual({ url: "/task/triage/t1/decide", body: { decision: "decline", reason: "Facilities handles printers" } })
    expect(lit()).toBe("t2")
  })

  it("3 marks the lit row a duplicate of a task picked with the house picker", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("3"))
    const original = await screen.findByText("Printer jams (the first report)")
    await act(async () => void fireEvent.click(original))
    await waitFor(() => expect(row("t1")).toBeNull())
    expect(posts[0]).toEqual({ url: "/task/triage/t1/decide", body: { decision: "duplicate", duplicate_of: "orig" } })
  })

  it("H snoozes with later.ts's choices, and the focus moves on", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("h"))
    const choice = await screen.findByRole("menuitem", { name: /Tomorrow morning/ })
    await act(async () => void fireEvent.click(choice))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].url).toBe("/task/triage/t1/decide")
    expect(posts[0].body.decision).toBe("snooze")
    expect(new Date(String(posts[0].body.until)).getTime()).toBeGreaterThan(Date.now())
    await waitFor(() => expect(lit()).toBe("t2"))
  })

  it("P sets a priority through the house setter's write", async () => {
    const { posts, P } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("p"))
    const high = await screen.findByRole("option", { name: /High/ })
    await act(async () => void fireEvent.click(high))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toEqual({ url: "/task/updateTaskPriority", body: { task_uuid: "t1", task_project_uuid: P, task_priority: "high" } })
    // A priority is no decision: the row stays lit, ready for 1.
    expect(lit()).toBe("t1")
  })

  it("hears 1 from the queue's own footer, where a closing menu hands the focus back to its button", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    const button = within(document.querySelector<HTMLElement>("[data-triage-actions]")!).getByRole("button", { name: /^Priority/ })
    act(() => button.focus())
    await act(async () => void fireEvent.keyDown(button, { key: "1" }))
    await waitFor(() => expect(row("t1")).toBeNull())
    expect(posts[0]).toEqual({ url: "/task/triage/t1/decide", body: { decision: "accept" } })
  })

  it("after a priority is picked the row keeps the focus, so 1 then accepts it (the popover hands it back to no button)", async () => {
    const { posts } = setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("p"))
    const high = await screen.findByRole("option", { name: /High/ })
    await act(async () => void fireEvent.click(high))
    await waitFor(() => expect(posts.length).toBe(1))
    // The popover's close has run its course (it gives the focus back a task later).
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))))
    expect(document.activeElement).toBe(row("t1"))
    await act(async () => void fireEvent.keyDown(document.activeElement!, { key: "1" }))
    await waitFor(() => expect(row("t1")).toBeNull())
    expect(posts[1]).toEqual({ url: "/task/triage/t1/decide", body: { decision: "accept" } })
  })
})

describe("a refused decision", () => {
  it("shows the server's words (409) and leaves the row where it was", async () => {
    setup({ refuse: { t1: refusal(409, "Give it a priority before accepting it.") } })
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("1"))
    expect((await screen.findByRole("alert")).textContent).toContain("Give it a priority before accepting it.")
    expect(row("t1")).not.toBeNull()
    expect(lit()).toBe("t1")
  })

  it("shows the server's words (403) and leaves the row where it was", async () => {
    setup({ refuse: { t1: refusal(403, "You can't change this task.") } })
    await waitFor(() => expect(lit()).toBe("t1"))
    await act(async () => void key("1"))
    expect((await screen.findByRole("alert")).textContent).toContain("You can't change this task.")
    expect(row("t1")).not.toBeNull()
  })
})

describe("who sees what in the queue", () => {
  it("offers a project admin the triage settings", async () => {
    const { onSettings } = setup({ canManage: true })
    await waitFor(() => expect(lit()).toBe("t1"))
    fireEvent.click(screen.getByRole("button", { name: /Triage settings/ }))
    expect(onSettings).toHaveBeenCalled()
  })

  it("lets a member who may not decide read the queue, with no decisions offered and keys that do nothing", async () => {
    const { posts } = setup({ canDecide: false })
    await waitFor(() => expect(row("t1")).not.toBeNull())
    expect(screen.queryByRole("button", { name: /Triage settings/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull()
    await act(async () => void fireEvent.keyDown(row("t1")!, { key: "1" }))
    expect(posts).toEqual([])
    expect(screen.getByText(/can change its tasks/)).toBeTruthy()
  })
})

describe("the queue's states", () => {
  it("empty: says nothing waits, and what arrives here", async () => {
    setup({ requests: [] })
    const empty = await screen.findByTestId("empty")
    expect(empty.textContent).toMatch(/Nothing waits in triage/)
    expect(empty.textContent).toMatch(/form/)
  })

  it("error: the server's words, and a retry that reads again", async () => {
    const { get } = setup({ fail: refusal(500, "Couldn't do that in triage.") })
    expect((await screen.findByTestId("failed")).textContent).toContain("Couldn't do that in triage.")
    const before = get.mock.calls.length
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(get.mock.calls.length).toBeGreaterThan(before)
  })

  it("offline: the house offline line, never a failure", async () => {
    h.offline = true
    setup({ fail: new Error("Network Error") })
    expect((await screen.findByText(/back online/)).closest("[data-part-later]")).not.toBeNull()
    expect(screen.queryByTestId("failed")).toBeNull()
  })

  it("loading: the house skeleton until the queue arrives", () => {
    setup()
    expect(screen.getByTestId("loading")).toBeTruthy()
  })
})

describe("on a phone (390, touch)", () => {
  it("a row is tapped to light it, and its decisions sit in a pinned footer", async () => {
    h.sheet = true
    setup()
    await waitFor(() => expect(row("t2")).not.toBeNull())
    fireEvent.click(row("t2")!)
    expect(lit()).toBe("t2")
    const footer = document.querySelector<HTMLElement>("[data-triage-actions]")!
    expect(within(footer).getByRole("button", { name: /^Accept/ })).toBeTruthy()
    expect(within(footer).getByRole("button", { name: /^Decline/ })).toBeTruthy()
  })

  it("declines in a drawer whose actions are in its pinned footer", async () => {
    h.sheet = true
    setup()
    await waitFor(() => expect(lit()).toBe("t1"))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-triage-actions]")!).getByRole("button", { name: /^Decline/ }))
    const dialog = await screen.findByRole("dialog", { name: /Decline/ })
    expect(dialog.getAttribute("data-v3-sheet")).toBe("")
    const footer = dialog.querySelector("[data-dialog-footer], footer, [data-slot=dialog-footer]")
    expect(footer && within(footer as HTMLElement).getByRole("button", { name: "Decline" })).toBeTruthy()
  })
})

// linear-21 H4: who is on triage duty, as the project's rota says (GET /project/{id}/triage/rota),
// for everyone the queue admits; only an admin is offered the way to set it.
describe("who is on duty", () => {
  // Dates from the clock the test runs by: the file writes none of its own (app/testClock.test).
  const rota = { people: ["ana", "gone"], weeks: 1, start: today(), on_duty: "ana", next_change: new Date(Date.now() + 7 * 86_400_000).toISOString() }

  it("a member reads who is on duty with no edit, the name from the project's people, read once", async () => {
    const { get } = setup({ canDecide: false, rota })
    const duty = await screen.findByTestId("triage-on-duty")
    await waitFor(() => expect(duty.textContent).toMatch(/On duty: Ana Ruiz/))
    expect(duty.textContent).toMatch(/until/)
    expect(screen.queryByRole("button", { name: /Set the rota/ })).toBeNull()
    expect(get.mock.calls.filter(([u]) => String(u).startsWith("/project/memberWithAdminFlag/")).length).toBe(1)
  })

  it("says nobody is on duty, offers an admin the rota, and reads no people for an empty one", async () => {
    const { get, onSettings } = setup({ canManage: true })
    const duty = await screen.findByTestId("triage-on-duty")
    await waitFor(() => expect(duty.textContent).toMatch(/Nobody is on triage duty/))
    fireEvent.click(screen.getByRole("button", { name: /Set the rota/ }))
    expect(onSettings).toHaveBeenCalled()
    expect(get.mock.calls.some(([u]) => String(u).startsWith("/project/memberWithAdminFlag/"))).toBe(false)
  })
})
