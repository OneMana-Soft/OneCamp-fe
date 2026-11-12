import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import BoardCall from "@/components/board/boardCall"
import { NoBoardCallsYet } from "@/components/board/noBoardCalls"
import { pinTestClock } from "@/lib/testing/testClock"
import { BOARD_HANDOFF_KEY } from "@/lib/calls/boardHandoff"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const BOARD = "b0a4d000-0000-4000-8000-0000000000d4"
const CH = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const ME = "1c7f6e5d-4c3b-4a21-9f8e-7d6c5b4a3021"
const LEE = "2d8a7f6e-5d4c-4b32-8a9f-8e7d6c5b4132"
const G = "3e9b8a7f-6e5d-4c43-9b8a-9f8e7d6c5243"

pinTestClock(new Date("2026-11-06T12:00:00Z"))

const LIVE = { session_id: "live", kind: "dm", conversation: `${ME} ${LEE}`, started_at: "2026-11-06T11:30:00Z", live: true, on_stage: true, shown_by: "Lee Park", shown_at: "2026-11-06T11:31:00Z", people: 2, artefacts: [] }
const PAST = {
  session_id: "past", kind: "channel", conversation: CH, started_at: "2026-11-05T10:00:00Z", ended_at: "2026-11-05T10:42:00Z", live: false, on_stage: false, shown_by: "Maya Chen", shown_at: "2026-11-05T10:05:00Z", people: 3,
  artefacts: [
    { key: "call-past", started_at: "2026-11-05T10:00:00Z", ended_at: "2026-11-05T10:42:00Z", lines: 12, notes_doc: "doc-1", recap_chat: G, recorded: false },
    { key: "EG_1", started_at: "2026-11-05T10:01:00Z", ended_at: "2026-11-05T10:40:00Z", lines: 12, recorded: true },
  ],
}
const answer = (calls: unknown[]) => ({ data: { msg: "ok", data: { calls } } })

let sheet = false
beforeEach(() => {
  sheet = false
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: sheet, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mount(get: (url: string) => Promise<unknown>, o: { post?: (url: string, body: unknown) => Promise<unknown>; edit?: boolean } = {}) {
  const http = { get: vi.fn(get), post: vi.fn(o.post ?? (async () => ({ data: { data: [] } }))) }
  const onPlay = vi.fn()
  render(<BoardCall board={BOARD} selfUUID={ME} http={http as never} onPlay={onPlay} empty={<NoBoardCallsYet />} hasEditAccess={o.edit ?? false} />)
  const button = screen.getByRole("button", { name: "Calls with this board" })
  return { http, onPlay, button, open: () => act(() => fireEvent.click(button)) }
}
const panel = () => screen.getByRole("dialog", { name: "Calls with this board" })

describe("a board's Call button", () => {
  it("reads the board's calls as it opens, a skeleton until they come, and asks again on every open", async () => {
    let answerNow: (v: unknown) => void = () => {}
    const b = mount(() => new Promise((r) => (answerNow = r)))
    expect(b.http.get).not.toHaveBeenCalled()
    b.open()
    expect(b.http.get).toHaveBeenCalledWith(`/board/getBoardCalls/${BOARD}`, { suppressErrorToast: true })
    expect(panel().querySelector('[aria-busy="true"]')).toBeTruthy()
    await act(async () => answerNow(answer([])))
    expect(within(panel()).getByRole("heading", { name: "No calls with this board yet." })).toBeTruthy()
    act(() => fireEvent.keyDown(panel(), { key: "Escape" }))
    b.open()
    expect(b.http.get).toHaveBeenCalledTimes(2)
  })

  it("says a board no call showed has none with the page's empty state, under no list heading; with a live call alone, that none has ended", async () => {
    const b = mount(async () => answer([]))
    b.open()
    const empty = await within(panel()).findByRole("heading", { name: "No calls with this board yet." })
    expect(empty.closest("[data-board-calls-empty]")?.textContent).toContain("Show this board in a call, and its recording, words and notes gather here.")
    expect(within(panel()).queryByRole("region", { name: "Calls with this board" })).toBeNull()
    act(() => fireEvent.keyDown(panel(), { key: "Escape" }))
    b.http.get.mockImplementation(async () => answer([LIVE]))
    b.open()
    const past = await within(panel()).findByRole("region", { name: "Calls with this board" })
    expect(within(past).getByText("No call with this board has ended yet.")).toBeTruthy()
    expect(within(panel()).queryByRole("heading", { name: "No calls with this board yet." })).toBeNull()
  })

  it("lists a live call to join by its conversation's own call page, and a past one with what it kept", async () => {
    const b = mount(async () => answer([PAST, LIVE]))
    b.open()
    const live = await within(panel()).findByRole("region", { name: "On a call now" })
    expect(within(live).getByText("In a direct message")).toBeTruthy()
    expect(within(live).getByText(/Lee Park put it up/)).toBeTruthy()
    expect(within(live).getByRole("link", { name: "Join" }).getAttribute("href")).toBe(`/app/meet/chat/${LEE}`)
    const past = within(panel()).getByRole("region", { name: "Calls with this board" })
    expect(past.querySelector("[data-board-call-past=\"past\"] .font-medium")?.textContent).toMatch(/ · 42 min$/)
    expect(within(past).getByText("In a channel · shown by Maya Chen")).toBeTruthy()
    expect(within(past).getByRole("link", { name: "Its chat" }).getAttribute("href")).toBe(`/app/channel/${CH}`)
    expect(within(past).getByRole("link", { name: "Call notes" }).getAttribute("href")).toBe("/app/doc/doc-1")
    expect(within(past).queryByRole("link", { name: "Join" })).toBeNull()
  })

  it("opens the one player by the conversation's routes: a recording by its egress id, words alone by the call's session key", async () => {
    const b = mount(async () => answer([PAST]))
    b.open()
    const playIt = await within(panel()).findByRole("button", { name: "Play recording" })
    act(() => fireEvent.click(playIt))
    await waitFor(() => expect(b.onPlay).toHaveBeenCalledTimes(1))
    expect(b.onPlay.mock.calls[0][0]).toMatchObject({ egressId: "EG_1", mediaGetUrl: `/ch/getRecordingURL/${CH}`, transcriptGetUrl: `/ch/getRecordingTranscript/${CH}`, recordedAt: PAST.started_at })
    b.open()
    const readIt = await within(panel()).findByRole("button", { name: "Read transcript" })
    act(() => fireEvent.click(readIt))
    await waitFor(() => expect(b.onPlay).toHaveBeenCalledTimes(2))
    expect(b.onPlay.mock.calls[1][0]).toMatchObject({ egressId: "call-past", mediaGetUrl: `/ch/getRecordingURL/${CH}`, transcriptGetUrl: `/ch/getRecordingTranscript/${CH}` })
  })

  it("says a refused read (403, 404) with Try again, shows nothing of the last answer, and never signs anyone out", async () => {
    let refuse = false
    const b = mount(async () => {
      if (refuse) throw { response: { status: 403 } }
      return answer([PAST])
    })
    b.open()
    await within(panel()).findByText("In a channel · shown by Maya Chen")
    act(() => fireEvent.keyDown(panel(), { key: "Escape" }))
    refuse = true
    b.open()
    const alert = await within(panel()).findByRole("alert")
    expect(alert.textContent).toContain("Couldn't load this board's calls.")
    expect(within(panel()).queryByText(/Maya Chen/)).toBeNull()
    // Only the board's calls were asked: no session route, no sign-out.
    expect(b.http.get.mock.calls.map((c) => c[0])).toEqual([`/board/getBoardCalls/${BOARD}`, `/board/getBoardCalls/${BOARD}`])
    refuse = false
    let release = () => {}
    b.http.get.mockImplementationOnce(() => new Promise((ok) => (release = () => ok(answer([PAST])))))
    act(() => fireEvent.click(within(alert).getByRole("button", { name: "Try again" })))
    // While it reads again, none of the refused list shows.
    expect(panel().querySelector("[aria-busy]")).not.toBeNull()
    expect(within(panel()).queryByText(/Maya Chen/)).toBeNull()
    act(() => release())
    await within(panel()).findByText("In a channel · shown by Maya Chen")
  })

  it("takes a read with no answer while the app is online as failed: the last list stays as it was, and with none, Couldn't load and Try again", async () => {
    let down = false
    const b = mount(async () => {
      if (down) throw { message: "Network Error" }
      return answer([PAST])
    })
    b.open()
    await within(panel()).findByText("In a channel · shown by Maya Chen")
    act(() => fireEvent.keyDown(panel(), { key: "Escape" }))
    down = true
    b.open()
    await waitFor(() => expect(b.http.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(panel().querySelector("[aria-busy]")).toBeNull())
    expect(within(panel()).getByText("In a channel · shown by Maya Chen")).toBeTruthy()
    expect(within(panel()).queryByText(/offline/)).toBeNull()
    cleanup()
    const none = mount(async () => {
      throw { message: "Network Error" }
    })
    none.open()
    const alert = await within(panel()).findByRole("alert")
    expect(alert.textContent).toContain("Couldn't load this board's calls.")
    expect(alert.textContent).not.toContain("offline")
  })

  it("says offline only while the app is: the last answer stays, said to be the last; with none, You're offline; and it reads again once the app is back", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    const b = mount(async () => answer([PAST]))
    b.open()
    await within(panel()).findByText("In a channel · shown by Maya Chen")
    act(() => fireEvent.keyDown(panel(), { key: "Escape" }))
    online.mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event("offline")))
    b.open()
    expect((await within(panel()).findByRole("status")).textContent).toContain("You're offline")
    expect(within(panel()).getByText("In a channel · shown by Maya Chen")).toBeTruthy()
    expect(b.http.get).toHaveBeenCalledTimes(1)
    online.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event("online")))
    await waitFor(() => expect(b.http.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(panel()).queryByRole("status")).toBeNull())
    cleanup()
    online.mockReturnValue(false)
    const none = mount(async () => answer([PAST]))
    none.open()
    expect((await within(panel()).findByRole("alert")).textContent).toContain("You're offline.")
    online.mockRestore()
  })

  it("says who showed the board on a live call it isn't on the stage of now", async () => {
    const b = mount(async () => answer([{ ...LIVE, on_stage: false }]))
    b.open()
    const live = await within(panel()).findByRole("region", { name: "On a call now" })
    expect(within(live).getByText(/Lee Park showed it earlier/)).toBeTruthy()
    expect(within(live).queryByText(/put it up/)).toBeNull()
  })

  it("asks the player for no words when a recorded call kept none", async () => {
    const b = mount(async () => answer([{ ...PAST, artefacts: [{ key: "EG_2", started_at: PAST.started_at, ended_at: PAST.ended_at, lines: 0, recorded: true }] }]))
    b.open()
    const playIt = await within(panel()).findByRole("button", { name: "Play recording" })
    act(() => fireEvent.click(playIt))
    await waitFor(() => expect(b.onPlay).toHaveBeenCalledTimes(1))
    expect(b.onPlay.mock.calls[0][0]).toMatchObject({ egressId: "EG_2", transcriptGetUrl: "" })
  })

  it("draws what a past call kept under its own line: its date once, and its chat once, where the recap went to the call's own group or direct message", async () => {
    const kept = (key: string, recap: string) => [{ ...PAST.artefacts[0], key, recap_chat: recap }]
    const GROUP = { ...PAST, session_id: "past-group", kind: "group", conversation: G, artefacts: kept("call-past-group", G) }
    const DM = { ...PAST, session_id: "past-dm", kind: "dm", conversation: `${ME} ${LEE}`, artefacts: kept("call-past-dm", `${ME} ${LEE}`) }
    const b = mount(async () => answer([PAST, GROUP, DM]))
    b.open()
    const rowOf = async (where: string) => (await within(panel()).findByText(`${where} · shown by Maya Chen`)).closest("[data-board-call-past]") as HTMLElement
    const links = (row: HTMLElement, href: string) => within(row).getAllByRole("link").filter((l) => l.getAttribute("href") === href)
    const channel = await rowOf("In a channel")
    expect(within(channel).getAllByText(/42 min/)).toHaveLength(1)
    expect(links(channel, `/app/channel/${CH}`)).toHaveLength(1)
    expect(links(channel, `/app/chat/group/${G}`)).toHaveLength(1)
    expect(within(channel).getByRole("link", { name: "Call notes" })).toBeTruthy()
    expect(links(await rowOf("In a group chat"), `/app/chat/group/${G}`)).toHaveLength(1)
    expect(links(await rowOf("In a direct message"), `/app/chat/${LEE}`)).toHaveLength(1)
  })

  it("is a sheet on a phone with its footer pinned under the list, whose Done closes it; a computer's popover has none", async () => {
    const computer = mount(async () => answer([PAST]))
    computer.open()
    await within(panel()).findByText("In a channel · shown by Maya Chen")
    expect(panel().querySelector("[data-overlay-footer]")).toBeNull()
    cleanup()
    sheet = true
    const phone = mount(async () => answer([PAST]))
    phone.open()
    await within(panel()).findByText("In a channel · shown by Maya Chen")
    const footer = panel().querySelector("[data-overlay-footer]")
    expect(footer).toBeTruthy()
    // Pinned: the footer follows the one scroller, never inside it.
    const body = panel().querySelector("[data-overlay-body]")
    expect(body?.contains(footer)).toBe(false)
    expect(body?.compareDocumentPosition(footer as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    act(() => fireEvent.click(within(footer as HTMLElement).getByRole("button", { name: "Done" })))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Calls with this board" })).toBeNull())
  })
})

// miro-27 H5b2, item 1: "Start a call in..." heads the board's Call. The conversations the board was called in before
// come first (the reader's own: the server answers no other), then a search over people, channels and groups (the
// app's one SearchUserAndChannel). One person is their DM, several a group of them (made the chat's own way: Add
// people, chat A9), a channel or a group itself. The call's own page opens; an editor's board goes up on its stage
// through a one-shot handoff (lib/calls/boardHandoff), never a URL. Offline, it says so and starts nothing.
describe("a board's Call: Start a call in...", () => {
  const MAYA = "4fac9b80-7f6e-4d54-8c9b-af9e8d7c6354"
  const GID = "5a0c9d8e7f6a4b5c8d9e0f1a2b3c4d5e"
  const handoff = () => JSON.parse(window.sessionStorage.getItem(BOARD_HANDOFF_KEY) ?? "null") as { room: string; board: string } | null
  const found = (people: Array<[string, string]>) => ({ data: { msg: "ok", data: people.map(([user_uuid, user_name]) => ({ user_uuid, user_name, user_dgraph_uid: `0x${user_name.length}` })) } })
  beforeEach(() => {
    push.mockClear()
    window.sessionStorage.clear()
  })
  async function startSection(b: ReturnType<typeof mount>) {
    b.open()
    await within(panel()).findByRole("button", { name: "Start a call in…" })
    act(() => fireEvent.click(within(panel()).getByRole("button", { name: "Start a call in…" })))
    return within(panel()).getByRole("region", { name: "Start a call" })
  }
  async function pick(section: HTMLElement, text: string, name: string) {
    fireEvent.change(within(section).getByRole("textbox", { name: "Search people, channels or groups" }), { target: { value: text } })
    const item = await within(section).findByText(name)
    act(() => fireEvent.click(item))
  }

  it("offers the conversations the board was called in before first; an editor's board goes up there by a one-shot handoff", async () => {
    const b = mount(async () => answer([PAST, LIVE]), { edit: true })
    const section = await startSection(b)
    const before = within(section).getByRole("list", { name: "Called with this board before" })
    expect(within(before).getAllByRole("button").map((x) => x.textContent)).toEqual([expect.stringContaining("In a direct message"), expect.stringContaining("In a channel")])
    // The app's own box (components/ui/checkbox), never a native input: drawn the same in every engine and theme, with
    // the app's focus ring and a finger's 44 px reach (data-touch-target), its label naming it.
    const box = within(section).getByRole("checkbox", { name: "Put this board up when the call starts" })
    expect(box.tagName).toBe("BUTTON")
    expect(box).toHaveAttribute("data-touch-target")
    expect(box).toHaveAttribute("aria-checked", "true")
    act(() => fireEvent.click(within(before).getByRole("button", { name: /In a channel/ })))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/app/meet/ch/${CH}`))
    expect(handoff()).toEqual(expect.objectContaining({ room: CH, board: BOARD }))
  })

  it("lets a reader start a call, with no board to put up; an editor may leave it down", async () => {
    const reader = mount(async () => answer([PAST]))
    let section = await startSection(reader)
    expect(within(section).queryByRole("checkbox")).toBeNull()
    act(() => fireEvent.click(within(section).getByRole("button", { name: /In a channel/ })))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/app/meet/ch/${CH}`))
    expect(handoff()).toBeNull()
    cleanup()
    const editor = mount(async () => answer([PAST]), { edit: true })
    section = await startSection(editor)
    const box = within(section).getByRole("checkbox", { name: "Put this board up when the call starts" })
    act(() => fireEvent.click(box))
    expect(box).toHaveAttribute("aria-checked", "false")
    act(() => fireEvent.click(within(section).getByRole("button", { name: /In a channel/ })))
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2))
    expect(handoff()).toBeNull()
  })

  it("searches with the app's one search; one person picked is their DM's call, the board handed to its room", async () => {
    const b = mount(async () => answer([]), { edit: true, post: async () => found([[LEE, "Lee Park"]]) })
    const section = await startSection(b)
    expect(within(section).queryByRole("list", { name: "Called with this board before" })).toBeNull()
    const start = within(section).getByRole("button", { name: "Start the call" }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    await pick(section, "lee", "Lee Park")
    expect(b.http.post).toHaveBeenCalledWith("/user/searchUserAndChannelList", { search_text: "lee" }, { suppressErrorToast: true })
    act(() => fireEvent.click(start))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/app/meet/chat/${LEE}`))
    expect(handoff()).toEqual(expect.objectContaining({ room: [LEE, ME].sort().join(" "), board: BOARD }))
  })

  it("makes several people a group by Add people, then opens its call", async () => {
    const post = vi.fn(async (url: string, body: unknown) => {
      void body
      if (url.startsWith("/user/")) return found([[LEE, "Lee Park"], [MAYA, "Maya Chen"]])
      return { data: { msg: "ok", data: { kind: "group", id: GID, existed: false } } }
    })
    const b = mount(async () => answer([]), { edit: true, post })
    const section = await startSection(b)
    await pick(section, "lee", "Lee Park")
    await pick(section, "maya", "Maya Chen")
    act(() => fireEvent.click(within(section).getByRole("button", { name: "Start the call" })))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/app/meet/grp/${GID}`))
    expect(post).toHaveBeenCalledWith(`/conversations/dm/${encodeURIComponent([LEE, ME].sort().join(" "))}/people`, { people: [MAYA], share: "none" }, { suppressErrorToast: true })
    expect(handoff()).toEqual(expect.objectContaining({ room: GID, board: BOARD }))
  })

  it("says a search that failed, and a group the server refused, in place, and opens nothing", async () => {
    let refuse = false
    const post = vi.fn(async (url: string) => {
      if (url.startsWith("/user/")) {
        if (refuse) return found([[LEE, "Lee Park"], [MAYA, "Maya Chen"]])
        throw new Error("Network Error")
      }
      throw Object.assign(new Error("400"), { response: { status: 400, data: { msg: "Those people can't be in a group together." } } })
    })
    const b = mount(async () => answer([]), { edit: true, post })
    const section = await startSection(b)
    fireEvent.change(within(section).getByRole("textbox", { name: "Search people, channels or groups" }), { target: { value: "lee" } })
    expect((await within(section).findByRole("alert")).textContent).toContain("Search didn't answer")
    refuse = true
    // Typing again searches again.
    await pick(section, "le", "Lee Park")
    await pick(section, "maya", "Maya Chen")
    act(() => fireEvent.click(within(section).getByRole("button", { name: "Start the call" })))
    await waitFor(() => expect(within(section).getByRole("alert").textContent).toContain("Those people can't be in a group together."))
    expect(push).not.toHaveBeenCalled()
    expect(handoff()).toBeNull()
  })

  it("says it is offline and starts nothing while the app is", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event("offline")))
    const b = mount(async () => answer([PAST]), { edit: true })
    b.open()
    act(() => fireEvent.click(within(panel()).getByRole("button", { name: "Start a call in…" })))
    const section = within(panel()).getByRole("region", { name: "Start a call" })
    expect(within(section).getByRole("status").textContent).toContain("You're offline")
    expect(within(section).queryByRole("button", { name: "Start the call" })).toBeNull()
    expect(within(section).queryByRole("textbox")).toBeNull()
    online.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event("online")))
  })
})
