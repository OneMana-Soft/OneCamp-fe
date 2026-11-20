import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// A project's SLA settings (linear-24 W2): its admins turn SLAs on, keep the
// rules in rank order and set the business clock's week; its members read them;
// a guest, whose GET /sla is a 403, is offered no SLAs entry at all (V-1011).

const P = "p-sla"
type Rule = { id: string; name: string; priorities: string[]; labels: string[]; type_ids: string[]; sources: string[]; target_minutes: number; clock: string; rank: number; virtual?: boolean }
const rule = (id: string, name: string, rank: number, more: Partial<Rule> = {}): Rule =>
  ({ id, name, priorities: [], labels: [], type_ids: [], sources: [], target_minutes: 240, clock: "business", rank, ...more })

let view: Record<string, unknown> | undefined
let slaError: unknown
let policy: Record<string, unknown> | undefined
const TYPES = [
  { id: "t-task", builtin: "task", name: "Task", icon: "task" },
  { id: "t-bug", builtin: "bug", name: "Bug", icon: "bug" },
  { id: "t-inc", name: "Incident", icon: "flame", own: true },
]
let types: typeof TYPES | null = TYPES
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => `/app/project/${P}`,
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url === `/project/${P}/sla`) return { data: slaError ? undefined : view && { data: view }, isError: !!slaError, error: slaError, mutate: vi.fn() }
    if (url === `/project/${P}/policies`) return { data: policy && { data: [policy] }, isError: false, mutate: vi.fn() }
    return { data: undefined, isError: false, mutate: vi.fn() }
  },
}))
// The project's tools hand the house confirm to their dialogs (hooks/useConfirm dispatches it to the app's UI manager).
vi.mock("react-redux", () => ({ useDispatch: () => () => undefined, useSelector: () => undefined }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(async () => undefined) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t), useToast: () => ({ toast }) }))

const calls: Array<[string, string, unknown]> = []
let refuseRestore = ""
let refusePolicy = ""
let refuseHours = ""
// What the server holds once a write lands (a default rule's first write makes the defaults the project's own).
let afterWrite: (() => void) | undefined
const answer = (method: string) => vi.fn(async (url: string, body?: unknown) => {
  calls.push([method, url, body])
  if (method !== "get") afterWrite?.()
  // The dialog reads through the client its page hands it (hooks/useProjectPolicy's ProjectCalls).
  if (method === "get" && url.endsWith("/sla")) {
    if (slaError) throw slaError
    return { data: { data: view } }
  }
  // The project's types (GET /types), the built-in ones first; the server may write none as null.
  if (method === "get" && url.endsWith("/types")) {
    if (url.includes("unread")) throw new Error("offline")
    return { data: { msg: "ok", data: types } }
  }
  if (method === "get" && url === `/project/${P}/policies`) return { data: { data: policy ? [policy] : [] } }
  if (method === "post" && url.startsWith("/restore/") && refuseRestore) {
    throw Object.assign(new Error("refused"), { response: { status: 409, data: { msg: refuseRestore } } })
  }
  if (method === "put" && url.endsWith("/sla/hours") && refuseHours) {
    throw Object.assign(new Error("refused"), { response: { status: 403, data: { msg: refuseHours } } })
  }
  if (url.includes("/policies/") && refusePolicy) throw Object.assign(new Error("refused"), { response: { status: 403, data: { msg: refusePolicy } } })
  if (url.includes("/policies/")) return { data: { data: { ...policy, value: (body as { value: unknown }).value, is_set: true } } }
  return { data: { msg: "ok", data: { ...(body as object), id: "r-new", rank: 3 } } }
})
const http = { get: answer("get"), put: answer("put"), post: answer("post"), patch: answer("patch"), delete: answer("delete") }
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: http }))

// The house confirm the page hands in (hooks/useConfirm): a test answers it by calling its onConfirm.
type Ask = { title: string; description: string; confirmText?: string; destructive?: boolean; onConfirm: () => unknown }
const confirm = vi.fn<(ask: Ask) => void>()
const projectCalls = { http, quiet: {}, mutate: vi.fn(async () => undefined), policies: `/project/${P}/policies`, confirm } as unknown as ProjectCalls
const { ProjectSlaDialog } = await import("./ProjectSlaDialog")
const { ProjectToolButtons } = await import("./ProjectToolButtons")

const week = { days: [1], start: "09:00", end: "17:00", tz: "Asia/Kolkata", week: { "1": [{ start: "09:00", end: "17:00" }] } }
const adminView = () => ({
  on: true,
  rules: [rule("r1", "Urgent first answer", 1, { priorities: ["urgent"], target_minutes: 60 }), rule("r2", "Everything else", 2, { target_minutes: 2880, clock: "calendar" })],
  defaults: false,
  hours: week,
  hours_set: true,
  can_manage: true,
})
const slaPolicy = (on: boolean) => ({ key: "projects.sla", kind: "bool", label: "SLAs", help: "", value: on, default: false, is_set: true })

beforeEach(() => {
  view = adminView()
  policy = slaPolicy(true)
  slaError = undefined
  types = TYPES
})
afterEach(() => {
  cleanup()
  calls.length = 0
  toast.mockClear()
  refuseRestore = ""
  refusePolicy = ""
  refuseHours = ""
  afterWrite = undefined
  confirm.mockClear()
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true })
})

// The dialog reads through its page's client once it opens: the read is in before a test looks.
const open = async (project = P) => {
  const shown = render(<ProjectSlaDialog projectId={project} calls={projectCalls} open onOpenChange={() => {}} />)
  await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
  return shown
}
const ruleRow = (name: string) => screen.getByRole("group", { name: new RegExp(name) })

describe("a project admin", () => {
  it("lists the rules in rank order, with their target, clock and what they match", async () => {
    await open()
    const rows = screen.getAllByRole("group", { name: /rule/i })
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Rule 1: Urgent first answer", "Rule 2: Everything else"])
    expect(within(rows[0]).getByText(/1 hour/)).toBeTruthy()
    expect(within(rows[0]).getByText(/1 hour, Business hours · Urgent$/)).toBeTruthy()
    expect(within(rows[1]).getByText(/2 days/)).toBeTruthy()
    expect(within(rows[1]).getByText(/Calendar time/i)).toBeTruthy()
  })

  it("turns SLAs off through the project's policy, the same read and save as who can change tasks", async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: /SLAs on/i })))
    expect(calls).toContainEqual(["put", `/project/${P}/policies/projects.sla`, { value: false }])
  })

  it("adds a rule, which the server keeps (POST /sla/rules)", async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a rule/i })))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "  Billing tickets " } })
    fireEvent.change(screen.getByLabelText(/Target, hours/i), { target: { value: "4" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    const sent = calls.find(([m, u]) => m === "post" && u === `/project/${P}/sla/rules`)
    expect(sent?.[2]).toMatchObject({ name: "Billing tickets", target_minutes: 240, clock: "business" })
  })

  it("moves a rule down by swapping its rank with the next one's: both ranks change (two PATCHes, CR-346 F2)", async () => {
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Urgent first answer")).getByRole("button", { name: /Move down/i })))
    // PATCH replaces the whole rule (business/SLA ruleOf), so each write sends the whole rule with its new rank.
    await vi.waitFor(() => expect(calls.filter(([m]) => m === "patch")).toHaveLength(2))
    expect(calls).toContainEqual(["patch", `/project/${P}/sla/rules/r1`, expect.objectContaining({ name: "Urgent first answer", target_minutes: 60, rank: 2 })])
    expect(calls).toContainEqual(["patch", `/project/${P}/sla/rules/r2`, expect.objectContaining({ name: "Everything else", target_minutes: 2880, rank: 1 })])
  })

  it("moves a default rule: the first write makes the defaults the project's own, so the second uses the id read again", async () => {
    view = { ...adminView(), defaults: true, rules: [rule("d1", "Urgent", 1, { priorities: ["urgent"], virtual: true }), rule("d2", "Everything else", 2, { virtual: true })] }
    // The server writes the defaults under fresh ids, the moved one with its new rank (business/SLA own, firstIDs).
    afterWrite = () => {
      view = { ...adminView(), defaults: false, rules: [rule("w2", "Everything else", 2), rule("w1", "Urgent", 2, { priorities: ["urgent"] })] }
      afterWrite = undefined
    }
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Urgent")).getByRole("button", { name: /Move down/i })))
    await vi.waitFor(() => expect(calls.filter(([m]) => m === "patch")).toHaveLength(2))
    const patches = calls.filter(([m]) => m === "patch")
    expect(patches[0]).toEqual(["patch", `/project/${P}/sla/rules/d1`, expect.objectContaining({ name: "Urgent", rank: 2 })])
    expect(patches[1]).toEqual(["patch", `/project/${P}/sla/rules/w2`, expect.objectContaining({ name: "Everything else", rank: 1 })])
  })

  // Every save offers itself back (instantSaveGuard): the toast's Undo sends the request that takes it back.
  const undoOffered = async (name: string) => {
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining(name) })), { timeout: 5000 })
    const offered = toast.mock.calls.at(-1)?.[0] as { action?: ReactElement<{ altText: string; onClick: () => unknown }> }
    expect(offered.action?.props.altText).toBe("Undo")
    await act(async () => {
      await offered.action?.props.onClick()
    })
  }

  it("a new rule's Undo takes it back softly, by the id the server gave it", async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a rule/i })))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Billing tickets" } })
    fireEvent.change(screen.getByLabelText(/Target, hours/i), { target: { value: "4" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    await undoOffered("Billing tickets")
    expect(calls.some(([m, u]) => m === "delete" && u === `/project/${P}/sla/rules/r-new`)).toBe(true)
  })

  it("a changed rule's Undo writes its words back, rank kept", async () => {
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Everything else")).getByRole("button", { name: "Change" })))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Everything left" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    await undoOffered("Everything left")
    const patches = calls.filter(([m]) => m === "patch")
    expect(patches.at(-1)).toEqual(["patch", `/project/${P}/sla/rules/r2`, expect.objectContaining({ name: "Everything else", target_minutes: 2880, rank: 2 })])
  })

  it("a move's Undo swaps the two back, found where they went", async () => {
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Urgent first answer")).getByRole("button", { name: /Move down/i })))
    await vi.waitFor(() => expect(calls.filter(([m]) => m === "patch")).toHaveLength(2))
    const [first, second] = adminView().rules
    view = { ...adminView(), rules: [{ ...second, rank: 1 }, { ...first, rank: 2 }] }
    await undoOffered("Urgent first answer")
    const back = calls.filter(([m]) => m === "patch").slice(2)
    expect(back).toEqual([
      ["patch", `/project/${P}/sla/rules/r1`, expect.objectContaining({ name: "Urgent first answer", rank: 1 })],
      ["patch", `/project/${P}/sla/rules/r2`, expect.objectContaining({ name: "Everything else", rank: 2 })],
    ])
  })

  // The hours' Undo puts back the week shown before the save, never the one the server holds after it.
  const shownBefore = { "1": [{ start: "09:00", end: "17:00" }] }
  type HoursPut = { hours: { week: Record<string, unknown> } }
  const saveTuesdayToo = async () => {
    const saved = { ...week, days: [1, 2], week: { ...shownBefore, "2": [{ start: "09:00", end: "17:00" }] } }
    afterWrite = () => void (view = { ...adminView(), hours: saved })
    await open()
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Work on Tuesdays" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save hours" })))
    const puts = () => calls.filter(([m, u]) => m === "put" && u === `/project/${P}/sla/hours`)
    expect((puts()[0]?.[2] as HoursPut).hours.week).toHaveProperty("2")
    return puts
  }

  it("the hours' Undo puts back the week shown before, not the one just saved", async () => {
    const puts = await saveTuesdayToo()
    await undoOffered("SLA hours")
    expect(puts()).toHaveLength(2)
    expect((puts()[1][2] as HoursPut).hours.week).toEqual(shownBefore)
  })

  it("the hours' Undo says the server's words when it is refused", async () => {
    const puts = await saveTuesdayToo()
    refuseHours = "Only the project's admins change its hours."
    await undoOffered("SLA hours")
    expect(puts()).toHaveLength(2)
    await vi.waitFor(() => expect(JSON.stringify(toast.mock.calls.slice(1))).toContain("Only the project's admins change its hours."))
  })

  it("removes a rule softly, and Undo brings it back through /restore", async () => {
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Everything else")).getByRole("button", { name: /Remove/i })))
    expect(calls.some(([m, u]) => m === "delete" && u === `/project/${P}/sla/rules/r2`)).toBe(true)
    // The Undo toast's code is a chunk of its own (services/restoreService offerUndo): its first load can take a while.
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Everything else") })), { timeout: 5000 })
    const offered = toast.mock.calls.at(-1)?.[0] as { action?: ReactElement<{ altText: string; onClick: () => unknown }> }
    expect(offered.action?.props.altText).toBe("Undo")
    await act(async () => {
      await offered.action?.props.onClick()
    })
    expect(calls.some(([m, u]) => m === "post" && u === "/restore/sla_rule/r2")).toBe(true)
  })

  it("removing a default rule asks first, says the defaults become the project's own, and offers no Undo (CR-346 F3)", async () => {
    view = { ...adminView(), defaults: true, rules: [rule("d1", "Urgent", 1, { virtual: true }), rule("d2", "Everything else", 2, { virtual: true })] }
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Everything else")).getByRole("button", { name: /Remove/i })))
    expect(confirm).toHaveBeenCalledTimes(1)
    const ask = confirm.mock.calls[0][0]
    expect(ask).toMatchObject({ destructive: true, title: expect.stringContaining("Everything else"), confirmText: "Remove rule" })
    expect(ask.description).toMatch(/defaults become this project's own/i)
    expect(calls.some(([m]) => m === "delete")).toBe(false)
    await act(async () => void (await ask.onConfirm()))
    expect(calls.some(([m, u]) => m === "delete" && u === `/project/${P}/sla/rules/d2`)).toBe(true)
    // A default's fixed id names no row once the defaults are written, so nothing offers to restore it.
    await act(async () => void (await new Promise((r) => setTimeout(r, 300))))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Everything else") }))
  })

  it("removing a rule of the project's own asks nothing: it goes with an Undo", async () => {
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Everything else")).getByRole("button", { name: /Remove/i })))
    expect(confirm).not.toHaveBeenCalled()
    expect(calls.some(([m, u]) => m === "delete" && u === `/project/${P}/sla/rules/r2`)).toBe(true)
  })

  it("says the server's words when SLAs on can't be saved, in the dialog's danger line (CR-346 F4)", async () => {
    refusePolicy = "Only the project's admins can turn its SLAs on or off."
    await open()
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: /SLAs on/i })))
    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Only the project's admins can turn its SLAs on or off."))
  })

  it("draws the rule form's choices as the house chips, under visible captions (CR-346 F7)", async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a rule/i })))
    for (const caption of ["Clock", "Priorities, none is any", "Made in, none is any"]) {
      expect(screen.getByText(caption)).toBeTruthy()
      const chips = within(screen.getByRole("group", { name: caption })).getAllByRole("button")
      expect(chips.length).toBeGreaterThan(1)
      for (const c of chips) expect(c.className).toMatch(/\bchip\b/)
    }
  })

  it("says the server's words when a restore would overfill the project (V-1012)", async () => {
    refuseRestore = "A project keeps at most 50 SLA rules."
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Everything else")).getByRole("button", { name: /Remove/i })))
    await vi.waitFor(() => expect(toast).toHaveBeenCalled())
    const offered = toast.mock.calls.at(-1)?.[0] as { action?: ReactElement<{ onClick: () => unknown }> }
    await act(async () => {
      await offered.action?.props.onClick()
    })
    await vi.waitFor(() => expect(JSON.stringify(toast.mock.calls.slice(1))).toContain("A project keeps at most 50 SLA rules."))
  })

  it("shows the defaults as the defaults, with a line saying they apply until an admin changes them", async () => {
    view = { ...adminView(), defaults: true, rules: [rule("d1", "Urgent", 1, { virtual: true })] }
    await open()
    expect(screen.getByText(/apply until an admin changes them/i)).toBeTruthy()
  })

  it("an empty project says it has no rules and offers to add one", async () => {
    view = { ...adminView(), rules: [] }
    await open()
    expect(screen.getByText(/No SLA rules yet/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Add a rule/i })).toBeTruthy()
  })

  // The server writes a list it never filled as null (Go's nil slice): its own defaults name a priority and no labels,
  // types or sources, and a project with no rules can come as rules: null. LIVE wZ39n broke on that (17 Nov).
  it("reads a list the server wrote as null as none: the defaults draw, and a change sends lists back", async () => {
    const asServer = { priorities: ["urgent"], labels: null, type_ids: null, sources: null }
    view = { ...adminView(), defaults: true, rules: [{ ...rule("d1", "Urgent", 0, { virtual: true, target_minutes: 1440 }), ...asServer }] }
    await open()
    expect(within(ruleRow("Urgent")).getByText(/1 day, Business hours · Urgent$/)).toBeTruthy()
    await act(async () => fireEvent.click(within(ruleRow("Urgent")).getByRole("button", { name: "Change" })))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Urgent now" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    expect(calls.filter(([m]) => m === "patch").at(-1)?.[2]).toMatchObject({ name: "Urgent now", priorities: ["urgent"], labels: [], type_ids: [], sources: [] })
    cleanup()
    view = { ...adminView(), rules: null }
    await open()
    expect(screen.getByText(/No SLA rules yet/i)).toBeTruthy()
  })

  it("offline, it writes nothing and says so in a plain line", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
    await open()
    await act(async () => fireEvent.click(within(ruleRow("Urgent first answer")).getByRole("button", { name: /Move down/i })))
    expect(calls.filter(([m]) => m !== "get")).toEqual([])
    expect(screen.getByText(/offline/i)).toBeTruthy()
  })

  it("a failed read offers a retry, not an empty list", async () => {
    slaError = Object.assign(new Error("boom"), { response: { status: 500 } })
    // A project this page never read: a read that fails after one came in keeps what was shown (lib/lazy/useKeptRead).
    render(<ProjectSlaDialog projectId="p-unread" calls={projectCalls} open onOpenChange={() => {}} />)
    expect(await screen.findByRole("button", { name: /Try again/i })).toBeTruthy()
    expect(screen.queryByText(/No SLA rules yet/i)).toBeNull()
  })
})

describe("a rule's work types (V-1063)", () => {
  const addRule = async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a rule/i })))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Incidents" } })
    fireEvent.change(screen.getByLabelText(/Target, hours/i), { target: { value: "2" } })
  }
  const typeChips = () => within(screen.getByRole("group", { name: "Work types, none is any" })).getAllByRole("button")

  it("an admin picks the project's types as the house chips, and the save sends their ids", async () => {
    await addRule()
    expect(typeChips().map((c) => c.textContent)).toEqual(["Task", "Bug", "Incident"])
    for (const c of typeChips()) expect(c.className).toMatch(/\bchip\b/)
    fireEvent.click(screen.getByRole("button", { name: "Incident" }))
    fireEvent.click(screen.getByRole("button", { name: "Task" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    const sent = calls.find(([m, u]) => m === "post" && u === `/project/${P}/sla/rules`)
    expect(sent?.[2]).toMatchObject({ name: "Incidents", type_ids: ["t-inc", "t-task"] })
  })

  it("a rule loaded with types names them in its caption, and its form shows them picked; unpicking sends none", async () => {
    view = { ...adminView(), rules: [rule("r1", "Bugs fast", 1, { type_ids: ["t-bug", "t-inc"], target_minutes: 60 })] }
    await open()
    expect(ruleRow("Bugs fast").textContent).toMatch(/Bug or Incident/)
    await act(async () => fireEvent.click(within(ruleRow("Bugs fast")).getByRole("button", { name: "Change" })))
    expect(screen.getByRole("button", { name: "Bug" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Task" }).getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "Bug" }))
    fireEvent.click(screen.getByRole("button", { name: "Incident" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    const sent = calls.find(([m, u]) => m === "patch" && u === `/project/${P}/sla/rules/r1`)
    expect(sent?.[2]).toMatchObject({ type_ids: [] })
  })

  it("a type the project no longer lists still counts in the caption", async () => {
    view = { ...adminView(), rules: [rule("r1", "Old kinds", 1, { type_ids: ["t-bug", "t-gone"] })] }
    await open()
    expect(ruleRow("Old kinds").textContent).toMatch(/Bug or 1 more type/)
  })

  it("a member reads a rule's types in its caption, with no chips to pick", async () => {
    view = { ...adminView(), can_manage: false, rules: [rule("r1", "Bugs fast", 1, { type_ids: ["t-bug"] })] }
    await open()
    expect(ruleRow("Bugs fast").textContent).toMatch(/· Bug$/)
    expect(screen.queryByRole("group", { name: /Work types/ })).toBeNull()
    expect(within(ruleRow("Bugs fast")).queryAllByRole("button")).toEqual([])
  })

  it("types that can't be read say so as the SLAs do, and Try again reads them again", async () => {
    // Another project's types, so none were kept from an earlier read.
    await open("p-unread")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a rule/i })))
    expect(screen.getByText(/The work types couldn.t be read/)).toBeTruthy()
    const before = calls.filter(([m, u]) => m === "get" && u === "/project/p-unread/types").length
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(calls.filter(([m, u]) => m === "get" && u === "/project/p-unread/types").length).toBe(before + 1)
  })

  it("a member whose rules name no types never reads them", async () => {
    view = { ...adminView(), can_manage: false }
    // Another project's settings, so no admin's view was kept from an earlier read.
    await open("p-member")
    expect(calls.some(([m, u]) => m === "get" && u === "/project/p-member/sla")).toBe(true)
    expect(calls.some(([m, u]) => m === "get" && u.endsWith("/types"))).toBe(false)
  })

  it("a project with no types (a list written as null) draws no type picker, never an empty one", async () => {
    types = null
    await addRule()
    expect(screen.queryByRole("group", { name: /Work types/ })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rule" })))
    const sent = calls.find(([m, u]) => m === "post" && u === `/project/${P}/sla/rules`)
    expect(sent?.[2]).toMatchObject({ type_ids: [] })
  })
})

describe("a member", () => {
  it("reads the settings with no controls drawn, hours included, and a line saying who can change them (CR-346 F5)", async () => {
    view = { ...adminView(), can_manage: false }
    await open()
    expect(screen.getByText(/Only the project's admins can change/i)).toBeTruthy()
    expect((screen.getByRole("switch", { name: /SLAs on/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole("button", { name: /Add a rule/i })).toBeNull()
    expect(within(ruleRow("Urgent first answer")).queryAllByRole("button")).toEqual([])
    expect(within(ruleRow("Everything else")).queryAllByRole("button")).toEqual([])
    // The business week as words: no day switches, no time fields, no range or copy buttons.
    expect(screen.queryAllByRole("switch", { name: /^Work on/ })).toEqual([])
    expect(screen.queryByLabelText(/Monday: from/)).toBeNull()
    expect(screen.queryByRole("button", { name: /range/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /Copy/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /Save hours/i })).toBeNull()
    const monday = document.querySelector('[data-hours-day="1"]')
    expect(monday?.textContent).toMatch(/Monday.*9:00.*5:00|Monday.*09:00.*17:00/)
    expect(document.querySelector('[data-hours-day="2"]')?.textContent).toMatch(/Tuesday.*Off/)
  })
})

describe("the SLAs entry in the project's tools", () => {
  it("a member is offered it", async () => {
    render(<ProjectToolButtons projectId={P} isAdmin={false} isMember />)
    expect(screen.getByRole("button", { name: "SLAs" })).toBeTruthy()
  })

  it("a guest, whose GET /sla is a 403, is offered no SLAs entry at all (V-1011)", async () => {
    slaError = Object.assign(new Error("forbidden"), { response: { status: 403 } })
    render(<ProjectToolButtons projectId={P} isAdmin={false} isMember />)
    expect(screen.queryByRole("button", { name: "SLAs" })).toBeNull()
    expect(screen.getByRole("button", { name: /Time logged/ })).toBeTruthy()
  })
})
