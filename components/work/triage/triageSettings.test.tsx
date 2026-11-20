import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"
import { today } from "@/lib/work/triageRota"

/**
 * A project's triage settings (linear-21 H3 c): its admins turn triage on and off and ask for a
 * priority before work leaves it (projects.triage, projects.triage.priority), through the same
 * policies call the SLA dialog and ProjectAccessDialog make (hooks/useProjectPolicy). A switch
 * asks the project's other reads again, so its info brings the tab (project_triage).
 */
const { TriageSettings } = await import("@/components/work/triage/TriageSettings")

let n = 0
const policy = (key: string, value: boolean) => ({ key, kind: "bool", label: key, help: "", value, default: false, is_set: false })

type Rota = { people: string[] | null; weeks: number; start: string; on_duty: string; next_change: string }
const NO_ROTA: Rota = { people: [], weeks: 1, start: "", on_duty: "", next_change: "" }

function setup({ readFails, rota = NO_ROTA, canManage = true, rotaFails, members, onArrivalRules }: {
  readFails?: unknown
  rota?: Rota
  canManage?: boolean
  rotaFails?: unknown
  members?: { user_uuid: string; user_name: string; user_full_name?: string }[]
  onArrivalRules?: () => void
} = {}) {
  // Each test its own project: a lazy dialog's reads are kept by path while the page lives (lib/lazy/useKeptRead).
  const P = `p${++n}`
  const values: Record<string, boolean> = { "projects.triage": false, "projects.triage.priority": false }
  let kept = rota
  let rotaRefused = rotaFails
  const get = vi.fn(async (url: string) => {
    if (url.endsWith("/triage/rota")) {
      if (rotaRefused) {
        const e = rotaRefused
        rotaRefused = undefined
        throw e
      }
      return { data: { msg: "ok", data: { rota: kept, can_manage: canManage } } }
    }
    if (readFails) throw readFails
    return { data: { msg: "ok", data: Object.entries(values).map(([k, v]) => policy(k, v)) } }
  })
  const put = vi.fn(async (url: string, body?: unknown) => {
    if (url.endsWith("/triage/rota")) {
      const b = body as { people: string[]; weeks: number; start: string }
      kept = { ...b, on_duty: b.people[0] ?? "", next_change: b.people.length > 1 ? new Date(Date.now() + 14 * 86_400_000).toISOString() : "" }
      return { data: { msg: "Saved.", data: { rota: kept } } }
    }
    const k = url.split("/").pop()!
    values[k] = (body as { value: boolean }).value
    return { data: { msg: "ok", data: policy(k, values[k]) } }
  })
  const mutate = vi.fn(async (_key: unknown, _data?: unknown, _opts?: unknown) => undefined)
  const calls = { http: { get, put, post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, quiet: {}, mutate, policies: `/project/${P}/policies`, confirm: vi.fn() } as unknown as ProjectCalls
  render(<TriageSettings projectId={P} calls={calls} open onOpenChange={() => {}} members={members} onArrivalRules={onArrivalRules} />)
  return { get, put, mutate, P }
}

afterEach(cleanup)

describe("a project's triage settings", () => {
  it("turn triage on through the project's policies call, then ask the project's info again so the tab comes", async () => {
    const { get, put, mutate, P } = setup()
    const on = await screen.findByRole("switch", { name: "Triage on" })
    expect(get).toHaveBeenCalledWith(`/project/${P}/policies`, {})
    await act(async () => void fireEvent.click(on))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/project/${P}/policies/projects.triage`, { value: true }, {}))
    const again = mutate.mock.calls.map((c) => c[0]).find((k) => typeof k === "function") as ((k: unknown) => boolean) | undefined
    expect(again?.(`/project/info/${P}`)).toBe(true)
  })

  it("ask for a priority before work leaves triage (projects.triage.priority)", async () => {
    const { put, P } = setup()
    const rule = await screen.findByRole("switch", { name: /Needs a priority to leave/ })
    await act(async () => void fireEvent.click(rule))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/project/${P}/policies/projects.triage.priority`, { value: true }, {}))
  })

  it("say what triage is: work from outside the board waits here until someone decides it", async () => {
    setup()
    const dialog = await screen.findByRole("dialog", { name: /Triage/ })
    expect(dialog.textContent).toMatch(/form/)
  })

  it("say the server's words when its policies can't be read (a member's 403), with no switch to press", async () => {
    setup({ readFails: Object.assign(new Error("Request failed with status code 403"), { isAxiosError: true, response: { status: 403, data: { msg: "Only the project's admins can change this." } } }) })
    await waitFor(() => expect(screen.queryByRole("switch", { name: "Triage on" })).toBeNull())
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't|admins/i)
  })
})

// linear-21 H4: who is on triage duty, in turns (GET/PUT /project/{id}/triage/rota, business/Triage
// rota.go), and the way to the rules on arriving work, in the same sheet. Names come from the
// project's people the sheet is handed (lib/work/triageRota), never a read of their own.
describe("the on-duty rota", () => {
  const members = [
    { user_uuid: "ana", user_name: "Ana Ruiz", user_full_name: "Ana Ruiz" },
    { user_uuid: "ben", user_name: "Ben Ode", user_full_name: "Ben Ode" },
    { user_uuid: "cy", user_name: "Cy Lee", user_full_name: "Cy Lee" },
  ]
  // Dates from the clock the test runs by: the file writes none of its own (app/testClock.test).
  const twoOn: Rota = { people: ["ana", "ben"], weeks: 1, start: today(), on_duty: "ana", next_change: new Date(Date.now() + 7 * 86_400_000).toISOString() }

  it("shows who is on duty, when it changes, and the turns in order", async () => {
    setup({ members, rota: twoOn })
    const rota = await screen.findByTestId("triage-rota")
    await waitFor(() => expect(rota.textContent).toMatch(/Ana Ruiz is on duty until/))
    expect(within(rota).getByRole("list", { name: "Turns" }).textContent).toMatch(/Ana Ruiz.*Ben Ode/)
  })

  it("lets an admin set the people and the turn, and sends the first turn's date it read (PUT people, weeks, start)", async () => {
    const { put, P } = setup({ members, rota: twoOn })
    const rota = await screen.findByTestId("triage-rota")
    const cy = await within(rota).findByRole("button", { name: "Cy Lee" })
    fireEvent.click(cy)
    const length = within(rota).getByRole("combobox", { name: "Turn length" })
    await act(async () => {
      length.focus()
      fireEvent.keyDown(length, { key: "Enter" })
    })
    await act(async () => fireEvent.keyDown(await screen.findByRole("option", { name: "2 weeks" }), { key: "Enter" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save rota" })))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/project/${P}/triage/rota`, { people: ["ana", "ben", "cy"], weeks: 2, start: twoOn.start }, {}))
    await waitFor(() => expect(rota.textContent).toMatch(/Ana Ruiz is on duty until/))
  })

  it("lets the first turn's day fill its row on a phone and size to its date from sm up, so the whole date shows at every width", async () => {
    setup({ members, rota: twoOn })
    const rota = await screen.findByTestId("triage-rota")
    const day = await within(rota).findByRole("button", { name: /^First turn starts/ })
    const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/)
    // The label's flex item is the field's box (DateField wraps its button in a block span): the box grows, the button fills it.
    const label = day.closest("label")
    const box = label?.querySelector(":scope > span") ?? null
    expect(classes(label)).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]))
    expect(classes(box)).toEqual(expect.arrayContaining(["flex-1", "min-w-0", "sm:flex-none"]))
    // No fixed width from sm up: a fixed box cut "Tue 17 Nov 2026" off at 1280 (R2 visual F1).
    expect(classes(box).filter((c) => /^(sm:)?w-/.test(c))).toEqual([])
    expect(classes(day)).toContain("w-full")
    expect(classes(day)).not.toContain("w-40")
  })

  it("nobody on the rota reads as nobody on duty, and a first rota starts today", async () => {
    const { put, P } = setup({ members, rota: { ...NO_ROTA, people: null } })
    const rota = await screen.findByTestId("triage-rota")
    await waitFor(() => expect(rota.textContent).toMatch(/Nobody is on triage duty/))
    fireEvent.click(await within(rota).findByRole("button", { name: "Ben Ode" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save rota" })))
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/project/${P}/triage/rota`, { people: ["ben"], weeks: 1, start: today() }, {}))
  })

  it("a rota that can't be read says so and offers Try again", async () => {
    const { get } = setup({ members, rotaFails: Object.assign(new Error("Network Error"), { isAxiosError: true }) })
    const rota = await screen.findByTestId("triage-rota")
    await waitFor(() => expect(within(rota).getByRole("alert").textContent).toMatch(/couldn't be read/))
    await act(async () => void fireEvent.click(within(rota).getByRole("button", { name: "Try again" })))
    await waitFor(() => expect(rota.textContent).toMatch(/Nobody is on triage duty/))
    expect(get.mock.calls.filter(([u]) => String(u).endsWith("/triage/rota")).length).toBe(2)
  })

  it("shows a reader the server lets read but not set the rota, with nothing to change", async () => {
    setup({ members, rota: twoOn, canManage: false })
    const rota = await screen.findByTestId("triage-rota")
    await waitFor(() => expect(rota.textContent).toMatch(/Ana Ruiz is on duty/))
    expect(within(rota).queryByRole("button", { name: "Cy Lee" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Save rota" })).toBeNull()
  })

  it("Rules on arrival opens the arrival rules", async () => {
    const onArrivalRules = vi.fn()
    setup({ members, onArrivalRules })
    await act(async () => void fireEvent.click(await screen.findByRole("button", { name: /Set rules on arrival/ })))
    expect(onArrivalRules).toHaveBeenCalled()
  })
})
