import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import type { CalendarSync } from "@/lib/calendar/calendarSync"

// What the server answers, by address: Outlook's link (/calendar/sync/microsoft),
// the person's connectors, and whether they are an admin.
const reads = vi.hoisted(() => ({ outlook: undefined as unknown, connected: false, admin: false, failing: [] as string[], refreshFailed: [] as string[], mutate: vi.fn(), calendars: undefined as unknown[] | undefined }))
const answer = (url: string) => {
  if (url === "/calendar/calendars") return reads.calendars ? { data: reads.calendars } : undefined
  if (url === "/calendar/sync/microsoft") return reads.outlook ? { data: reads.outlook } : undefined
  if (url === "/connectors") return { data: { connectors: [{ id: "microsoft_calendar", name: "Outlook Calendar", icon_key: "outlook", connected: reads.connected, permissions: [], description: "" }] } }
  if (url === "/user/profile") return { data: { user_is_admin: reads.admin } }
  return undefined
}
vi.mock("@/hooks/useFetch", () => ({
  // A read in `failing` answered an error: no data, and the error (useFetch's isError). One in `refreshFailed`
  // failed on a refresh under what is drawn: SWR keeps the data it had and hands the error beside it.
  useFetch: (url: string) =>
    url && reads.failing.includes(url)
      ? { data: undefined, isError: new Error("500"), mutate: reads.mutate }
      : { data: url ? answer(url) : undefined, isError: url && reads.refreshFailed.includes(url) ? new Error("500") : undefined, mutate: reads.mutate },
  useFetchOnlyOnce: (url: string) => ({ data: url ? answer(url) : undefined, mutate: reads.mutate }),
}))
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: http.get, post: http.post } }))
const swrMutate = vi.hoisted(() => vi.fn())
vi.mock("swr", async (orig) => ({ ...(await orig<typeof import("swr")>()), useSWRConfig: () => ({ mutate: swrMutate }) }))
// The app's confirm, said yes to at once: it runs the action and keeps what it threw, as confirmAlertDialog's
// error path does. The phone's options ask through useConfirm, the panel through its confirm prop.
const confirmed = vi.hoisted(() => [] as Promise<unknown>[])
const confirmYes = vi.hoisted(() => (o: { onConfirm: () => unknown }) => void confirmed.push(Promise.resolve().then(o.onConfirm).catch((err: unknown) => err)))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirmYes }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { CalendarsPanel } from "./calendarsPopover"
import { CalendarOptionsDrawer } from "@/components/drawers/calendarOptionsDrawer"
import OtherCalendarsLayer from "./otherCalendarsLayer"
import { readFileSync } from "node:fs"
import { useConnectorLink } from "@/lib/calendar/calendarSync"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
afterEach(() => {
  cleanup()
  Object.assign(reads, { outlook: undefined, connected: false, admin: false, failing: [], refreshFailed: [], calendars: undefined })
  confirmed.length = 0
  reads.mutate.mockReset()
  http.get.mockReset()
  http.post.mockReset()
  swrMutate.mockReset()
})

const sync = (p: Partial<CalendarSync>): CalendarSync => ({ provider: "microsoft", state: "none", progress: 0, moved: 0, unchanged: 0, available: true, ...p })
const panelOf = (onImported = vi.fn()) => (
  <CalendarsPanel anchor={new Date(2026, 9, 15)} view="week" hasItems={() => false} onPick={vi.fn()} rows={[]} onBookingPages={vi.fn()} googleConnected={false} onImported={onImported} confirm={confirmYes} />
)
const panel = (onImported = vi.fn()) => render(panelOf(onImported))
const tile = () => document.querySelector("[data-sync-tile='microsoft']") as HTMLElement

// Calendar B7: Outlook's tile beside Google's, in each state the link can be in.
describe("the Outlook tile", () => {
  it("says in plain words that the admin turns Outlook on, and shows a member nothing to fill in", () => {
    reads.outlook = sync({ available: false })
    panel()
    expect(tile().textContent).toMatch(/^Outlook Calendar/)
    expect(tile().textContent).toMatch(/Your admin turns Outlook on by adding a free Microsoft app\./)
    expect(screen.queryByRole("button", { name: /Connect Outlook/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /How to turn on Outlook/ })).toBeNull()
    expect(tile().textContent).not.toMatch(/secret|client id/i)
  })

  // DESIGN-BUILD-117 F1: the steps sit on the Microsoft card in Admin, where the admin acts; the panel keeps one line.
  it("points an admin to Admin, Integrations in one line, with no steps in the panel", () => {
    reads.outlook = sync({ available: false })
    reads.admin = true
    panel()
    expect(tile().textContent).toMatch(/Add a free Microsoft app in Admin, Integrations/)
    expect(screen.getByRole("link", { name: "Admin, Integrations" }).getAttribute("href")).toBe("/app/admin?tab=integrations#integrations-oauth-microsoft")
    expect(tile().querySelector("[data-outlook-how]")).toBeNull()
    expect(screen.queryByRole("button", { name: /How to turn on Outlook/ })).toBeNull()
    expect(tile().textContent).not.toMatch(/Azure|connector\/oauth\/callback/)
  })

  it("connects Outlook through the connectors, coming back to the calendar", async () => {
    reads.outlook = sync({})
    http.get.mockResolvedValue({ data: { data: { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1" } } })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Connect Outlook Calendar" }))
    await waitFor(() => expect(http.get).toHaveBeenCalled())
    expect(http.get.mock.calls[0][0]).toBe("/connectors/microsoft_calendar/connect?return=calendar")
  })

  it("never fails to connect in silence: the app's own error words say it, and Connect works again", async () => {
    reads.outlook = sync({})
    http.get.mockRejectedValue(new Error("502"))
    panel()
    const connect = screen.getByRole("button", { name: "Connect Outlook Calendar" }) as HTMLButtonElement
    fireEvent.click(connect)
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1))
    // Asked without OWN_ERRORS, so the shared interceptor's toast says what went wrong.
    expect(http.get.mock.calls[0][1]?.suppressErrorToast).toBeFalsy()
    await waitFor(() => expect(connect.disabled).toBe(false))
  })

  it("once linked, moves everything from Outlook, then says the account and when both were in step", async () => {
    reads.outlook = sync({})
    reads.connected = true
    http.post.mockResolvedValue({ data: { data: sync({ state: "moving", progress: 0 }) } })
    const { unmount } = panel()
    expect(tile().querySelector("[role=status]")?.textContent).toBe("Connected")
    fireEvent.click(screen.getByRole("button", { name: "Move everything from Outlook" }))
    await waitFor(() => expect(http.post).toHaveBeenCalled())
    expect(http.post.mock.calls[0][0]).toBe("/calendar/sync/microsoft/move")
    unmount()
    reads.outlook = sync({ state: "synced", progress: 100, account: "maya@contoso.com", last_synced_at: new Date(Date.now() - 120000).toISOString() })
    panel()
    expect(tile().querySelector("[role=status]")?.textContent).toBe("maya@contoso.com · In step with Outlook · 2m ago")
    expect(screen.getByRole("button", { name: "Disconnect Outlook Calendar" })).toBeTruthy()
  })

  it("says once that Outlook stopped answering, and connects it again", async () => {
    reads.outlook = sync({ state: "broken", account: "maya@contoso.com", error: "Microsoft stopped answering for this account. Connect it again." })
    reads.connected = true
    http.get.mockResolvedValue({ data: { data: { url: "https://login.microsoftonline.com/x" } } })
    panel()
    const status = tile().querySelector("[role=status]") as HTMLElement
    expect(status.textContent).toBe("maya@contoso.com · Outlook stopped answering")
    expect(status.className).toMatch(/\btext-danger-ink\b/)
    expect(screen.getAllByText(/stopped answering/)).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Connect Outlook again" }))
    await waitFor(() => expect(http.get.mock.calls[0]?.[0]).toBe("/connectors/microsoft_calendar/connect?return=calendar"))
  })

  // The picker: the calendars a move brought are the person's to show or hide in My calendars at once.
  it("reads the calendar list again when a move finishes, so its calendars are there to pick", () => {
    reads.outlook = sync({ state: "moving", progress: 50 })
    reads.connected = true
    const imported = vi.fn()
    const { rerender } = panel(imported)
    reads.outlook = sync({ state: "synced", progress: 100, account: "maya@contoso.com" })
    rerender(<CalendarsPanel anchor={new Date(2026, 9, 15)} view="week" hasItems={() => false} onPick={vi.fn()} rows={[]} onBookingPages={vi.fn()} googleConnected={false} onImported={imported} />)
    expect(swrMutate).toHaveBeenCalledWith("/calendar/calendars")
    expect(imported).toHaveBeenCalled()
  })

  // CR-B22 G1: a read that failed hid Outlook without a word. Its line says so quietly, as the panel's other
  // reads do (SaysLoadFailure keeps the failure's toast quiet); while it loads, nothing is drawn yet.
  it("says quietly that Outlook Calendar couldn't load when its link can't be read, and nothing while it loads", () => {
    reads.failing = ["/calendar/sync/microsoft"]
    const { unmount } = panel()
    expect(tile().textContent).toBe("Outlook Calendar couldn't load")
    expect(screen.queryByRole("button", { name: /Outlook/ })).toBeNull()
    unmount()
    // Outlook's app is set up, and the person's connectors can't be read.
    reads.failing = ["/connectors"]
    reads.outlook = sync({})
    const second = panel()
    expect(tile().textContent).toBe("Outlook Calendar couldn't load")
    second.unmount()
    reads.failing = []
    reads.outlook = undefined
    panel()
    expect(tile()).toBeNull()
  })

  // CR-B23 T1: a refresh's failure keeps what is shown (lib/http/loadFailure.ts). A focus refresh that answers a 5xx
  // under a drawn tile leaves SWR's data beside the error; the tile stays, with no "couldn't load" line.
  it.each(["/calendar/sync/microsoft", "/connectors"])("keeps a linked Outlook drawn when a refresh of %s fails under it", (url) => {
    reads.outlook = sync({ state: "synced", progress: 100, account: "maya@contoso.com" })
    reads.connected = true
    reads.refreshFailed = [url]
    panel()
    expect(tile().querySelector("[role=status]")?.textContent).toBe("maya@contoso.com · In step with Outlook")
    expect(screen.getByRole("button", { name: "Disconnect Outlook Calendar" })).toBeTruthy()
    expect(screen.queryByText(/couldn't load/)).toBeNull()
  })

  // CR-B23 L4: the panel's Connect says it is busy while its ask is out, so there is nothing to tap twice.
  it("holds the panel's Connect while its ask is out", () => {
    reads.outlook = sync({})
    http.get.mockReturnValue(new Promise(() => {}))
    panel()
    const connect = screen.getByRole("button", { name: "Connect Outlook Calendar" }) as HTMLButtonElement
    expect(connect.disabled).toBe(false)
    fireEvent.click(connect)
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(connect.disabled).toBe(true)
  })
})

// CR-B22 L2: one ask at a time, for the panel and the phone's options alike: a second tap while Connect or
// Disconnect is out sends nothing, and the link says it is busy, so each surface disables its buttons.
describe("Outlook's link, asked once at a time", () => {
  it("sends one connect for two taps, and stays busy while the page leaves for Microsoft", async () => {
    http.get.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useConnectorLink("microsoft", true))
    act(() => {
      void result.current.connect()
      void result.current.connect()
    })
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(true)
  })

  it("sends one disconnect for two taps, and is free again once it is done", async () => {
    let done: (v: unknown) => void = () => {}
    http.post.mockReturnValue(new Promise((resolve) => (done = resolve)))
    const { result } = renderHook(() => useConnectorLink("microsoft", true))
    let first: Promise<unknown> = Promise.resolve()
    act(() => {
      first = result.current.disconnect()
      void result.current.disconnect()
    })
    expect(http.post).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(true)
    await act(async () => {
      done({ data: {} })
      await first
    })
    expect(result.current.busy).toBe(false)
  })

  // CR-B23 T2: disconnect frees in finally. A failed Disconnect reaches the confirm that asked (its error path),
  // and leaves nothing held: every surface's buttons work again without a reload.
  it("is free again after a disconnect that failed, and the confirm that asked hears why", async () => {
    http.post.mockRejectedValue(new Error("502"))
    const { result } = renderHook(() => useConnectorLink("microsoft", true))
    let asked: Promise<unknown> = Promise.resolve()
    act(() => {
      asked = result.current.disconnect()
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      await expect(asked).rejects.toThrow("502")
    })
    expect(reads.mutate).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })

  // A broken link: the panel's Connect again and Disconnect, held while the ask is out, free once it failed; if a
  // refresh then reads Outlook as unlinked (the server did it, the answer was lost), its Connect works too.
  it("frees the panel's Connect again, Disconnect and Connect after a disconnect that failed", async () => {
    reads.outlook = sync({ state: "broken", account: "maya@contoso.com" })
    reads.connected = true
    let fail: (err: unknown) => void = () => {}
    http.post.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const { rerender } = panel()
    const again = screen.getByRole("button", { name: "Connect Outlook again" }) as HTMLButtonElement
    const disconnect = screen.getByRole("button", { name: "Disconnect Outlook Calendar" }) as HTMLButtonElement
    fireEvent.click(disconnect)
    await waitFor(() => expect(http.post).toHaveBeenCalledWith("/connectors/microsoft_calendar/disconnect", {}))
    expect([again.disabled, disconnect.disabled]).toEqual([true, true])
    await act(async () => {
      fail(new Error("502"))
      expect(await confirmed[0]).toEqual(new Error("502"))
    })
    expect([again.disabled, disconnect.disabled]).toEqual([false, false])
    reads.connected = false
    rerender(panelOf())
    expect((screen.getByRole("button", { name: "Connect Outlook Calendar" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("frees the phone's Disconnect and Connect again after a disconnect that failed", async () => {
    reads.outlook = sync({ state: "broken", account: "maya@contoso.com" })
    reads.connected = true
    let fail: (err: unknown) => void = () => {}
    http.post.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    render(<CalendarOptionsDrawer drawerOpenState setOpenState={vi.fn()} />)
    const again = () => screen.getByRole("button", { name: /Connect Outlook again/ }) as HTMLButtonElement
    const disconnect = () => screen.getByRole("button", { name: /Disconnect Outlook Calendar/ }) as HTMLButtonElement
    fireEvent.click(disconnect())
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1))
    expect([again().disabled, disconnect().disabled]).toEqual([true, true])
    await act(async () => {
      fail(new Error("502"))
      await confirmed[0]
    })
    expect([again().disabled, disconnect().disabled]).toEqual([false, false])
  })
})

// gcal-14 (W2 at 390): the phone's calendar options name a project's, a channel's or a team's calendar by its
// container and say the level the server gives and who it is shared with, as the computer's panel does.
describe("a container's calendar in the phone's options", () => {
  it("shows its container's mark, the level and that it is shared with the container's members", () => {
    reads.calendars = [
      { id: "c1", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" },
      { id: "c5", name: "design", kind: "channel", container_kind: "channel", container_id: "ch-1", access: "view" },
      { id: "c6", name: "Design team", kind: "team", container_kind: "team", container_id: "t-1", access: "edit" },
      { id: "c4", name: "Maya Chen", kind: "personal", access: "view" },
    ]
    render(<CalendarOptionsDrawer drawerOpenState setOpenState={vi.fn()} />)
    const theirs = document.querySelector("[data-drawer-other-calendars]") as HTMLElement
    // The row is the button around its switch.
    const rowOf = (name: string) => screen.getByRole("switch", { name: `Show ${name}` }).parentElement?.closest("button") as HTMLElement
    for (const [name, mark, words] of [
      ["Launch", "folder-kanban", "Can edit · Shared with the project's members"],
      ["design", "hash", "View only · Shared with the channel's members"],
      ["Design team", "users", "Can edit · Shared with the team's members"],
    ] as const) {
      const row = rowOf(name)
      expect(theirs.contains(row)).toBe(true)
      expect(row.textContent).toContain(words)
      expect(row.querySelector(`svg.lucide-${mark}`)).toBeTruthy()
    }
    // A calendar that is no container's says none of it.
    expect(rowOf("Maya Chen").textContent).not.toContain("Shared with")
  })

  // CR-295 G1: at 390 an empty one says what fills it, as the computer's panel does, by the calendar's own count
  // of the week (the one the panel shows), which the calendars' read hands on; a read that failed says no such thing.
  it("says what fills an empty one, by the calendar's count of its week, and nothing of it when the read failed", async () => {
    reads.calendars = [
      { id: "c1", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" },
      { id: "c5", name: "design", kind: "channel", container_kind: "channel", container_id: "ch-1", access: "view" },
    ]
    const from = new Date(2026, 9, 18)
    const to = new Date(2026, 9, 25)
    // The calendar's count of the week: two on Launch, none on design.
    const weekCount = (pass: (it: { event_calendar_id?: string }) => boolean) => [{ event_calendar_id: "c1" }, { event_calendar_id: "c1" }].filter(pass).length
    const both = () => (
      <>
        <OtherCalendarsLayer from={from} to={to} onChange={vi.fn()} weekCount={weekCount} />
        <CalendarOptionsDrawer drawerOpenState setOpenState={vi.fn()} />
      </>
    )
    const { rerender } = render(both())
    const rowOf = (name: string) => screen.getByRole("switch", { name: `Show ${name}` }).parentElement?.closest("button") as HTMLElement
    await waitFor(() => expect(rowOf("design").textContent).toContain("View only · Tasks linked from its messages show here"))
    expect(rowOf("Launch").textContent).toContain("Can edit · Shared with the project's members")
    // Its read failed: Couldn't load is the calendar's to say, never that nothing is on it.
    reads.failing = [`/calendar/calendars/events?ids=c1,c5&from=${from.toISOString()}&to=${to.toISOString()}`]
    rerender(both())
    await waitFor(() => expect(rowOf("design").textContent).toContain("View only · Shared with the channel's members"))
    expect(rowOf("design").textContent).not.toContain("show here")
  })

  // basecamp-05 head 3: a phone makes a link to a project's calendar as the computer's row menu does
  // (Show in another app), in the same dialog, from beside the row (never inside its button with the switch).
  it("offers a project's calendar in another app, in the computer's dialog for that calendar", async () => {
    reads.calendars = [
      { id: "c1", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" },
      { id: "c9", name: "Holidays", kind: "subscribed", access: "view" },
    ]
    render(<CalendarOptionsDrawer drawerOpenState setOpenState={vi.fn()} />)
    const entry = screen.getByRole("button", { name: "Show Launch in another app" })
    // Beside the row: the row stays the one button around its switch.
    const row = screen.getByRole("switch", { name: "Show Launch" }).parentElement?.closest("button") as HTMLElement
    expect(row.contains(entry)).toBe(false)
    expect(entry.closest("button")).toBe(entry)
    // A calendar read from an address is subscribed to at its address, never a link of yours.
    expect(screen.queryByRole("button", { name: "Show Holidays in another app" })).toBeNull()
    fireEvent.click(entry)
    expect(await screen.findByText("Show \u201cLaunch\u201d in another app")).toBeTruthy()
  })

  it("says it from the one line and the one test the panel uses", () => {
    for (const file of ["../drawers/calendarOptionsDrawer.tsx", "./calendarsPopover.tsx"]) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8")
      expect(text, file).toContain("emptyLine(")
      expect(text, file).not.toMatch(/\.empty\b|count === 0/)
    }
  })
})
