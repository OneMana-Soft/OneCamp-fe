import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import LegalHoldsCard from "./LegalHoldsCard"
import type { RetentionHttp } from "@/lib/admin/legalHolds"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
// DateField is a picker, driven by its own tests; here it stands in as a plain date box with the same value and change.
vi.mock("@/components/ui/date-field", () => ({
  DateField: ({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) => <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />,
}))
// The card offers its changes back in place: the toast's offer (useSaveStatus loads it on first use) must never be asked.
const offerBack = vi.hoisted(() => vi.fn())
vi.mock("@/components/ui/undoToast", () => ({ offerBack }))

/** What the card's live regions say: a save confirmed in place, never a toast over the next step (main, 3 Nov 02:0x). */
const said = (words: string) => screen.queryAllByRole("status").some((s) => s.textContent === words)

const RULES = {
  rules: [{ kind: "calendar", label: "calendar events", help: "Events that ended this many days ago are removed for good.", days: 0, min: 0, max: 3650 }],
  kinds: [{ name: "calendar", label: "calendar events", formats: ["ics", "json"] }],
}
// Named by the one rule (lib/personName displayNameOf): the name a member chose.
const ASHA = { user_uuid: "u-asha", user_name: "Asha Rao" }
const RAVI = { user_uuid: "u-ravi", user_name: "Ravi Iyer" }
const HOLD = { id: "h1", name: "Acme v. Rivera", note: "Board minutes", created_by: "u-asha", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", people: ["u-asha", "u-ravi"] }
const OLD = { ...HOLD, id: "h0", name: "Old matter", people: [], released_at: "2026-09-01T10:00:00Z", released_by: "u-asha" }

type Call = { method: string; url: string; params?: Record<string, unknown>; body?: unknown }
/** Calls that would also raise the client's shared error toast: the card says every failure in place, so none may (main, 3 Nov 02:0x). */
const loud: string[] = []
const refused = (status: number, msg: string) => Object.assign(new Error(msg), { isAxiosError: true, response: { status, data: { msg } } })
/** The server's answer to a rule sent with a count that moved since it was shown (business/Retention CountMoved): 409 with the count now. */
const MOVED = "The count changed since it was shown. Check the new count, then save again."
const moved = (now: number) => Object.assign(new Error(MOVED), { isAxiosError: true, response: { status: 409, data: { msg: MOVED, data: { would_remove: now } } } })

/** The page's client, as the /admin/retention routes answer it. */
/** An answer with headers of its own, as axios gives them (lower-case names). */
class Answered {
  constructor(
    readonly data: unknown,
    readonly headers: Record<string, string>,
  ) {}
}

function fakeHttp(over: Partial<Record<string, (c: Call) => unknown>> = {}) {
  const calls: Call[] = []
  const answer = (method: string) =>
    vi.fn(async (url: string, a?: unknown, b?: unknown) => {
      const c: Call = method === "get" ? { method, url, params: (a as { params?: Record<string, unknown> })?.params } : { method, url, body: a }
      const config = (method === "get" ? a : b) as { suppressErrorToast?: boolean } | undefined
      if (!config?.suppressErrorToast) loud.push(`${method} ${url}`)
      calls.push(c)
      const own = over[`${method} ${url}`]
      if (own) {
        const got = await own(c)
        return got instanceof Answered ? { data: got.data, headers: got.headers } : { data: got }
      }
      if (url === "/admin/retention/rules") return { data: { data: RULES } }
      if (url === "/admin/retention/rules/calendar/preview") return { data: { data: { days: Number(c.params?.days), would_remove: 42 } } }
      if (method === "put") return { data: { data: { ...RULES.rules[0], days: (a as { days: number }).days } } }
      if (url === "/admin/retention/holds" && method === "get") return { data: { data: [HOLD, OLD] } }
      if (url === "/user/allUsers") return { data: { users: [ASHA, RAVI] } }
      if (url.endsWith("/items/calendar")) return { data: { data: [{ id: "e1", title: "Board review", start: "2026-10-02T09:00:00Z", repeats: false, deleted_at: "2026-10-05T09:00:00Z" }] } }
      if (url.includes("/export/")) return { data: new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" }) }
      return { data: { data: HOLD } }
    })
  const http = { get: answer("get"), put: answer("put"), post: answer("post"), patch: answer("patch") } as unknown as RetentionHttp
  return { http, calls }
}

const zone = process.env.TZ
afterEach(() => {
  expect(loud.splice(0), "calls that would also raise the shared error toast").toEqual([])
  cleanup()
  offerBack.mockReset()
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe("the legal holds card", () => {
  pinTestClock()
  it("never saves a rule blind: the count it would remove comes first, and Save sends that count back", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    const days = await screen.findByLabelText("Remove calendar events after")
    fireEvent.change(days, { target: { value: "365" } })
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeDisabled()
    expect(await screen.findByText("42 of the workspace's calendar events would be removed at the next sweep.")).toBeTruthy()
    expect(calls.find((c) => c.url.endsWith("/preview"))?.params).toEqual({ days: 365 })
    await waitFor(() => expect(save).not.toBeDisabled())
    await act(async () => fireEvent.click(save))
    expect(calls.find((c) => c.method === "put")).toEqual({ method: "put", url: "/admin/retention/rules/calendar", body: { days: 365, shown: 42 } })
    // Confirmed in place, by the row: "Saved" with its tick beside the label, and said by its live region.
    await waitFor(() => expect(said("Saved")).toBe(true))
    expect(screen.getByText("Remove calendar events after").parentElement?.querySelector("[data-saved-tick]")).not.toBeNull()
  })

  it("says a count that moved in the server's words, counts again, and saves on the count now", async () => {
    // As the server answers: a rule is saved only with the count it would remove now, else 409 with that count.
    let now = 42
    const { http, calls } = fakeHttp({
      "get /admin/retention/rules/calendar/preview": (c) => ({ data: { days: Number(c.params?.days), would_remove: now } }),
      "put /admin/retention/rules/calendar": (c) => {
        const sent = c.body as { days: number; shown: number }
        return sent.shown === now ? { data: { ...RULES.rules[0], days: sent.days } } : Promise.reject(moved(now))
      },
    })
    render(<LegalHoldsCard http={http} />)
    fireEvent.change(await screen.findByLabelText("Remove calendar events after"), { target: { value: "30" } })
    const save = screen.getByRole("button", { name: "Save" })
    expect(await screen.findByText("42 of the workspace's calendar events would be removed at the next sweep.")).toBeTruthy()
    await waitFor(() => expect(save).not.toBeDisabled())
    now = 43
    await act(async () => fireEvent.click(save))
    // The row says it wasn't saved, in the server's words, where its help was (the settings rows' own failure line).
    await waitFor(() => expect(said(`Not saved. ${MOVED}`)).toBe(true))
    expect(screen.getByText(MOVED).parentElement?.textContent).toBe(`Not saved. ${MOVED}`)
    // Counted again before Save comes back, and Save sends the count now.
    expect(await screen.findByText("43 of the workspace's calendar events would be removed at the next sweep.")).toBeTruthy()
    await waitFor(() => expect(save).not.toBeDisabled())
    await act(async () => fireEvent.click(save))
    expect(calls.filter((c) => c.method === "put").map((c) => c.body)).toEqual([
      { days: 30, shown: 42 },
      { days: 30, shown: 43 },
    ])
    await waitFor(() => expect(said("Saved")).toBe(true))
  })

  it("lists holds with their people's names, live ones able to search, change and release, released ones none of those", async () => {
    const { http } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    const list = await screen.findByRole("list", { name: "Legal holds" })
    const live = within(list).getByRole("listitem", { name: "Acme v. Rivera" })
    expect(await within(live).findByText("Asha Rao, Ravi Iyer")).toBeTruthy()
    for (const name of ["Search Acme v. Rivera", "Change Acme v. Rivera", "Release Acme v. Rivera"]) expect(within(live).getByRole("button", { name })).toBeTruthy()
    // A released hold's items are neither searched nor exported: the server answers 409 for both (liveHold).
    const old = within(list).getByRole("listitem", { name: "Old matter" })
    expect(old.textContent).toContain("by Asha Rao")
    expect(within(old).queryAllByRole("button")).toEqual([])
  })

  it("places a hold with its name and note, and changes one by who joined and who left", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Place a hold" }))
    // A name as long as the server keeps (business/Retention: 1 to 120 characters).
    expect(screen.getByLabelText("Name").getAttribute("maxLength")).toBe("120")
    fireEvent.click(screen.getByRole("button", { name: "Place the hold" }))
    expect(screen.getByRole("alert").textContent).toBe("Give the hold a name, such as the matter it is for.")
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Beta matter " } })
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "From counsel" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place the hold" })))
    expect(calls.find((c) => c.method === "post")).toEqual({ method: "post", url: "/admin/retention/holds", body: { name: "Beta matter", note: "From counsel", add: [] } })
    // Confirmed in place, beside the list's heading, once the list shows it: no toast lands on the new row's actions.
    await waitFor(() => expect(said("Saved")).toBe(true))
    expect(screen.getByRole("heading", { name: "Legal holds" }).parentElement?.querySelector("[data-saved-tick]")).not.toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    fireEvent.click(await screen.findByRole("button", { name: "Take Ravi Iyer off the hold" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the hold" })))
    expect(calls.find((c) => c.method === "patch")).toEqual({ method: "patch", url: "/admin/retention/holds/h1", body: { name: "Acme v. Rivera", note: "Board minutes", add: [], remove: ["u-ravi"] } })
  })

  it("sends nothing for a change that changes nothing, and offers nothing back", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    // The same name (its spaces aside), note and people: the dialog closes, and nothing is sent, saved or offered back.
    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Acme v. Rivera " } })
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Board minutes " } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the hold" })))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(calls.some((c) => c.method === "patch")).toBe(false)
    expect(said("Saved")).toBe(false)
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull()
    // Any one of them changed is a change: the note, then the name.
    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Board minutes, Q4" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the hold" })))
    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme v. Rivera (appeal)" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the hold" })))
    expect(calls.filter((c) => c.method === "patch").map((c) => c.body)).toEqual([
      { name: "Acme v. Rivera", note: "Board minutes, Q4", add: [], remove: [] },
      { name: "Acme v. Rivera (appeal)", note: "Board minutes", add: [], remove: [] },
    ])
  })

  it("says a failed member read in the hold's dialog, and reads the members again on Try again", async () => {
    let down = true
    const { http, calls } = fakeHttp({ "get /user/allUsers": () => (down ? Promise.reject(refused(503, "Down")) : { users: [ASHA, RAVI] }) })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Place a hold" }))
    const retry = await screen.findByRole("button", { name: "Couldn't load the members. Try again" })
    expect(screen.queryByText("Loading members…")).toBeNull()
    down = false
    await act(async () => fireEvent.click(retry))
    await waitFor(() => expect(screen.getByRole("button", { name: "Add people" })).not.toBeDisabled())
    expect(calls.filter((c) => c.url === "/user/allUsers").length).toBe(2)
  })

  it("reads a hold's names again and takes a person off it with the shared controls, each with a finger's reach (DB-99, 390)", async () => {
    let down = true
    const { http } = fakeHttp({ "get /user/allUsers": () => (down ? Promise.reject(refused(503, "Down")) : { users: [ASHA, RAVI] }) })
    render(<LegalHoldsCard http={http} />)
    // The row says how many when the names can't be read, and offers them again: the shared Button, which carries the reach.
    const again = await screen.findByRole("button", { name: "Show their names" })
    expect(again.hasAttribute("data-touch-target")).toBe(true)
    down = false
    await act(async () => fireEvent.click(again))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show their names" })).toBeNull())
    // A person comes off the hold by the shared Chip's ×, which carries the reach too.
    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    expect((await screen.findByRole("button", { name: "Take Ravi Iyer off the hold" })).hasAttribute("data-touch-target")).toBe(true)
  })

  it("releases a hold only once it is confirmed, and says a refusal in the server's words", async () => {
    const { http, calls } = fakeHttp({ "post /admin/retention/holds/h1/release": () => Promise.reject(refused(409, "That hold was already released.")) })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Release Acme v. Rivera" }))
    expect(calls.some((c) => c.url.endsWith("/release"))).toBe(false)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Release the hold" })))
    expect((await screen.findByRole("alert")).textContent).toBe("That hold was already released.")
  })

  // Every change saved with a tick is offered back (design-14), here beside the tick, never on a toast: at 390 a
  // toast lay over the new row's actions (main, 3 Nov 02:0x).
  it("offers a saved rule back beside its tick: back to keeping everything at once", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    fireEvent.change(await screen.findByLabelText("Remove calendar events after"), { target: { value: "365" } })
    const save = screen.getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).not.toBeDisabled())
    await act(async () => fireEvent.click(save))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo: Calendar events removed after 365 days" })))
    // Keeping everything removes nothing, so its count is 0 by definition, and the log's "shown" stays what was so.
    expect(calls.filter((c) => c.method === "put").map((c) => c.body)).toEqual([{ days: 365, shown: 42 }, { days: 0, shown: 0 }])
    await waitFor(() => expect(said("Undone")).toBe(true))
    expect((screen.getByLabelText("Remove calendar events after") as HTMLInputElement).value).toBe("")
    expect(offerBack).not.toHaveBeenCalled()
  })

  it("puts a rule's offer away once its days change again: Undo never takes back a number the field no longer shows", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    const days = await screen.findByLabelText("Remove calendar events after")
    fireEvent.change(days, { target: { value: "365" } })
    const save = screen.getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).not.toBeDisabled())
    await act(async () => fireEvent.click(save))
    await screen.findByRole("button", { name: "Undo: Calendar events removed after 365 days" })
    fireEvent.change(days, { target: { value: "30" } })
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull()
    expect(calls.filter((c) => c.method === "put")).toHaveLength(1)
  })

  it("offers no way back from one number of days to another: that rule's count comes first, as every rule's does", async () => {
    const { http } = fakeHttp({ "get /admin/retention/rules": () => ({ data: { ...RULES, rules: [{ ...RULES.rules[0], days: 30 }] } }) })
    render(<LegalHoldsCard http={http} />)
    const days = (await screen.findByLabelText("Remove calendar events after")) as HTMLInputElement
    await waitFor(() => expect(days.value).toBe("30"))
    fireEvent.change(days, { target: { value: "365" } })
    const save = screen.getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).not.toBeDisabled())
    await act(async () => fireEvent.click(save))
    await waitFor(() => expect(said("Saved")).toBe(true))
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull()
    expect(offerBack).not.toHaveBeenCalled()
  })

  it("offers a hold placed, changed or released back beside the list's heading", async () => {
    const { http, calls } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    // Placed: Undo releases it.
    fireEvent.click(await screen.findByRole("button", { name: "Place a hold" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Beta matter" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place the hold" })))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo: Placed Beta matter" })))
    expect(calls.filter((c) => c.method === "post").map((c) => c.url)).toEqual(["/admin/retention/holds", "/admin/retention/holds/h1/release"])
    await waitFor(() => expect(said("Undone")).toBe(true))
    // Changed: Undo puts back who left, and the name and note it had.
    fireEvent.click(await screen.findByRole("button", { name: "Change Acme v. Rivera" }))
    fireEvent.click(await screen.findByRole("button", { name: "Take Ravi Iyer off the hold" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the hold" })))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo: Changed Acme v. Rivera" })))
    expect(calls.filter((c) => c.method === "patch").map((c) => c.body)).toEqual([
      { name: "Acme v. Rivera", note: "Board minutes", add: [], remove: ["u-ravi"] },
      { name: "Acme v. Rivera", note: "Board minutes", add: ["u-ravi"], remove: [] },
    ])
    // Released: Undo places it again, with its name, note and people (a release has no way back of its own).
    fireEvent.click(await screen.findByRole("button", { name: "Release Acme v. Rivera" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Release the hold" })))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo: Released Acme v. Rivera" })))
    expect(calls.filter((c) => c.method === "post").at(-1)).toEqual({ method: "post", url: "/admin/retention/holds", body: { name: "Acme v. Rivera", note: "Board minutes", add: ["u-asha", "u-ravi"] } })
    await waitFor(() => expect(said("Undone")).toBe(true))
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull()
    expect(offerBack).not.toHaveBeenCalled()
  })

  it("says an undo that fails beside the list's heading, in the server's words", async () => {
    const { http } = fakeHttp({ "post /admin/retention/holds/h1/release": () => Promise.reject(refused(409, "That hold was already released.")) })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Place a hold" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Beta matter" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place the hold" })))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo: Placed Beta matter" })))
    await waitFor(() => expect(said("Couldn't undo that. That hold was already released.")).toBe(true))
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull()
  })

  it("searches a hold, marks deleted items, and saves an export named after the hold", async () => {
    // Days go as the admin's own midnights, To as the next day's, so the To day is kept whole (lib/admin/legalHolds).
    process.env.TZ = "Asia/Kolkata"
    const { http, calls } = fakeHttp()
    const created = vi.fn(() => "blob:hold")
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } })
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-01" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(screen.getByRole("alert").textContent).toBe("To comes after from.")
    expect(calls.some((c) => c.url.endsWith("/items/calendar"))).toBe(false)
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-12-01" } })
    fireEvent.change(screen.getByLabelText("Words"), { target: { value: "board" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })))
    expect(calls.find((c) => c.url.endsWith("/items/calendar"))?.params).toEqual({ q: "board", from: "2026-03-01T00:00:00+05:30", to: "2026-12-02T00:00:00+05:30" })
    const item = await screen.findByRole("listitem", { name: "Board review" })
    expect(item.hasAttribute("data-deleted")).toBe(true)
    expect(item.textContent).toContain("Deleted")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    expect(calls.find((c) => c.url.includes("/export/"))).toEqual({ method: "get", url: "/admin/retention/holds/h1/export/calendar", params: { format: "ics", q: "board", from: "2026-03-01T00:00:00+05:30", to: "2026-12-02T00:00:00+05:30" } })
    const link = await screen.findByRole("link", { name: "Save Acme v. Rivera - calendar events.ics" })
    expect(link.getAttribute("download")).toBe("Acme v. Rivera - calendar events.ics")
    expect(link.getAttribute("href")).toBe("blob:hold")
    // A changed search drops the file it no longer matches, and its object URL with it.
    fireEvent.change(screen.getByLabelText("Words"), { target: { value: "minutes" } })
    expect(screen.queryByRole("link", { name: /^Save / })).toBeNull()
    expect(revoked).toHaveBeenCalledWith("blob:hold")
  })

  // V-388 (1): an export past the server's part size comes in parts. Each saved part says it is one, and offers the next.
  it("says when an export is only part of the hold's items, and exports the rest on a tap", async () => {
    const parts: Record<string, Answered> = {
      "": new Answered(new Blob(["BEGIN:VCALENDAR"]), { "x-exported-items": "20000", "x-export-part": "1", "x-export-next": "2.YWJj" }),
      "2.YWJj": new Answered(new Blob(["BEGIN:VCALENDAR"]), { "x-exported-items": "1234", "x-export-part": "2" }),
    }
    const { http, calls } = fakeHttp({ "get /admin/retention/holds/h1/export/calendar": (c) => parts[String(c.params?.part ?? "")] })
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:part"), revokeObjectURL: vi.fn() })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    expect(await screen.findByText("Part 1: the first 20,000 calendar events that match, not all of them. Export part 2 for the rest.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Save Acme v. Rivera - calendar events - part 1.ics" })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export part 2" })))
    expect(calls.filter((c) => c.url.includes("/export/")).map((c) => c.params)).toEqual([{ format: "ics" }, { format: "ics", part: "2.YWJj" }])
    expect(await screen.findByText("Part 2, the last: 1,234 more calendar events. Parts 1 to 2 hold all that match.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Save Acme v. Rivera - calendar events - part 2.ics" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Export part/ })).toBeNull()
  })

  // V-431: a legal export never loses a part. Asking for the next part before saving this one keeps this one to save,
  // and any part made can be made again from where it starts; only its own file is replaced.
  it("keeps every part of an export to save, and makes any part again from where it starts", async () => {
    const parts: Record<string, Answered> = {
      "": new Answered(new Blob(["one"]), { "x-exported-items": "20000", "x-export-part": "1", "x-export-next": "2.YWJj" }),
      "2.YWJj": new Answered(new Blob(["two"]), { "x-exported-items": "20000", "x-export-part": "2", "x-export-next": "3.ZGVm" }),
      "3.ZGVm": new Answered(new Blob(["three"]), { "x-exported-items": "7", "x-export-part": "3" }),
    }
    const { http, calls } = fakeHttp({ "get /admin/retention/holds/h1/export/calendar": (c) => parts[String(c.params?.part ?? "")] })
    let made = 0
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++made}`), revokeObjectURL: revoked })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export part 2" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export part 3" })))
    const saves = () => [1, 2, 3].map((n) => screen.getByRole("link", { name: `Save Acme v. Rivera - calendar events - part ${n}.ics` }).getAttribute("href"))
    expect(saves()).toEqual(["blob:1", "blob:2", "blob:3"])
    expect(revoked).not.toHaveBeenCalled()
    const list = screen.getByRole("list", { name: "The export's parts" })
    expect(within(list).getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual(["Part 1", "Part 2", "Part 3"])
    // Part 2 made again starts where part 1 ends, and takes over only part 2's file.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export again: part 2" })))
    expect(calls.filter((c) => c.url.includes("/export/")).map((c) => c.params?.part ?? "")).toEqual(["", "2.YWJj", "3.ZGVm", "2.YWJj"])
    expect(saves()).toEqual(["blob:1", "blob:4", "blob:3"])
    expect(revoked.mock.calls).toEqual([["blob:2"]])
    expect(screen.getByText("Part 3, the last: 7 more calendar events. Parts 1 to 3 hold all that match.")).toBeTruthy()
    // A changed search lets every part go, each object URL with it.
    fireEvent.change(screen.getByLabelText("Words"), { target: { value: "minutes" } })
    expect(screen.queryByRole("link", { name: /^Save / })).toBeNull()
    expect(revoked.mock.calls.map(([href]) => href).sort()).toEqual(["blob:1", "blob:2", "blob:3", "blob:4"])
  })

  it("says when a part made again no longer joins the next one, and makes that one again from the new end", async () => {
    let first = 0
    const parts: Record<string, () => Answered> = {
      // The hold's items changed between the two times part 1 was made: it ends somewhere else the second time.
      "": () => new Answered(new Blob(["one"]), { "x-exported-items": "20000", "x-export-part": "1", "x-export-next": ++first === 1 ? "2.YWJj" : "2.T1RI" }),
      "2.YWJj": () => new Answered(new Blob(["two"]), { "x-exported-items": "5", "x-export-part": "2" }),
      "2.T1RI": () => new Answered(new Blob(["two again"]), { "x-exported-items": "6", "x-export-part": "2" }),
    }
    const { http, calls } = fakeHttp({ "get /admin/retention/holds/h1/export/calendar": (c) => parts[String(c.params?.part ?? "")]() })
    let made = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++made}`), revokeObjectURL: vi.fn() })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export part 2" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export again: part 1" })))
    expect(await screen.findByText("Part 1 came out different when it was made again, so part 2 no longer starts where it ends. Export part 2 again.")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export again: part 2" })))
    expect(calls.filter((c) => c.url.includes("/export/")).map((c) => c.params?.part ?? "")).toEqual(["", "2.YWJj", "", "2.T1RI"])
    expect(screen.getByText("Part 2, the last: 6 more calendar events. Parts 1 to 2 hold all that match.")).toBeTruthy()
  })

  it("makes one part at a time: while one is made, it says so and the other parts wait", async () => {
    let answer: (a: Answered) => void = () => {}
    const first = new Answered(new Blob(["one"]), { "x-exported-items": "20000", "x-export-part": "1", "x-export-next": "2.YWJj" })
    const { http } = fakeHttp({ "get /admin/retention/holds/h1/export/calendar": (c) => (c.params?.part ? new Promise<Answered>((r) => (answer = r)) : first) })
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    fireEvent.click(screen.getByRole("button", { name: "Export part 2" }))
    expect(screen.getByRole("button", { name: "Exporting…" }).getAttribute("aria-busy")).toBe("true")
    expect((screen.getByRole("button", { name: "Export again: part 1" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => answer(new Answered(new Blob(["two"]), { "x-exported-items": "3", "x-export-part": "2" })))
    expect((screen.getByRole("button", { name: "Export again: part 1" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("drops a part that arrives after its search changed", async () => {
    let answer: (a: Answered) => void = () => {}
    const { http } = fakeHttp({ "get /admin/retention/holds/h1/export/calendar": () => new Promise<Answered>((r) => (answer = r)) })
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:late"), revokeObjectURL: revoked })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    fireEvent.click(screen.getByRole("button", { name: "Export .ics" }))
    fireEvent.change(screen.getByLabelText("Words"), { target: { value: "minutes" } })
    await act(async () => answer(new Answered(new Blob(["one"]), { "x-exported-items": "3", "x-export-part": "1" })))
    expect(screen.queryByRole("link", { name: /^Save / })).toBeNull()
    expect(revoked).toHaveBeenCalledWith("blob:late")
  })

  it("keeps each read's failure to itself, with a retry", async () => {
    const { http } = fakeHttp({ "get /admin/retention/holds": () => Promise.reject(refused(503, "Not recorded")) })
    render(<LegalHoldsCard http={http} />)
    expect(await screen.findByText(/Couldn't load the legal holds/)).toBeTruthy()
    expect(await screen.findByLabelText("Remove calendar events after")).toBeTruthy()
  })

  // miro-44 R (V-388 (2)): boards are Retention's second kind. A hold's search asks which kind when there are two or more,
  // and each kind searches, names and exports its own; a change of kind drops what the other one found.
  const TWO = {
    rules: [...RULES.rules, { kind: "boards", label: "boards", help: "Boards in the trash this many days are removed for good.", days: 0, min: 0, max: 3650 }],
    kinds: [...RULES.kinds, { name: "boards", label: "boards", formats: ["json"] }],
  }
  const BOARD = { id: "b1", title: "Launch plan", detail: "Made by Asha Rao", repeats: false }

  it("asks which kind a hold's search is for when there are two, and searches, names and exports each kind as its own", async () => {
    const { http, calls } = fakeHttp({
      "get /admin/retention/rules": () => ({ data: TWO }),
      "get /admin/retention/holds/h1/items/boards": () => ({ data: [BOARD] }),
    })
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:hold"), revokeObjectURL: revoked })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    const kinds = screen.getByRole("radiogroup", { name: "Items" })
    expect(within(kinds).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["Calendar events", "true"],
      ["Boards", "false"],
    ])
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })))
    expect(await screen.findByRole("listitem", { name: "Board review" })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .ics" })))
    expect(await screen.findByRole("link", { name: "Save Acme v. Rivera - calendar events.ics" })).toBeTruthy()

    // Another kind: what the first one found, and its file, go; the export offers the new kind's own formats.
    fireEvent.click(within(kinds).getByRole("radio", { name: "Boards" }))
    expect(screen.queryByRole("listitem", { name: "Board review" })).toBeNull()
    expect(screen.queryByRole("link", { name: /^Save / })).toBeNull()
    expect(revoked).toHaveBeenCalledWith("blob:hold")
    expect(screen.getByText(/Everything its people's boards hold/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Export .ics" })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })))
    expect(calls.filter((c) => c.url.includes("/items/")).map((c) => c.url)).toEqual(["/admin/retention/holds/h1/items/calendar", "/admin/retention/holds/h1/items/boards"])
    // A board has no date of its own to show: its line says what it has, never "No date".
    const board = await screen.findByRole("listitem", { name: "Launch plan" })
    expect(board.textContent).toBe("Launch planMade by Asha Rao")
    expect(within(screen.getByRole("list", { name: "Held boards" })).getAllByRole("listitem")).toHaveLength(1)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export .json" })))
    expect(calls.filter((c) => c.url.includes("/export/")).at(-1)).toEqual({ method: "get", url: "/admin/retention/holds/h1/export/boards", params: { format: "json" } })
    expect(await screen.findByRole("link", { name: "Save Acme v. Rivera - boards.json" })).toBeTruthy()
  })

  it("never shows an answer under a kind it wasn't asked for", async () => {
    let answer: (v: unknown) => void = () => {}
    const { http } = fakeHttp({
      "get /admin/retention/rules": () => ({ data: TWO }),
      "get /admin/retention/holds/h1/items/calendar": () => new Promise((done) => (answer = done)),
    })
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    fireEvent.click(screen.getByRole("radio", { name: "Boards" }))
    await act(async () => answer({ data: [{ id: "e1", title: "Board review", start: "2026-10-02T09:00:00Z", repeats: false }] }))
    expect(screen.queryByRole("listitem", { name: "Board review" })).toBeNull()
    expect(screen.queryByRole("list", { name: "Held boards" })).toBeNull()
    expect(screen.queryByText(/^1 match/)).toBeNull()
  })

  it("asks no kind when a hold keeps only one", async () => {
    const { http } = fakeHttp()
    render(<LegalHoldsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Search Acme v. Rivera" }))
    expect(screen.getByText(/Everything its people's calendar events hold/)).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })
})
