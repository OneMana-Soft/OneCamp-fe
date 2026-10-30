import { Suspense, useState } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { doorPath, linkDoor, roomDoor, roomLink } from "@/services/guestDoor"
import { dropUnlock, keepUnlock, keptUnlock } from "@/components/guest/roomUnlock"

// A personal room's address (/r/<slug>, calls CALLS-2): its passcode first,
// then the meeting as any guest meets it, asked at the room's own door.

const status = vi.fn()
vi.mock("@/services/guestDoor", async (orig) => ({
  ...(await orig<typeof import("@/services/guestDoor")>()),
  getGuestMeetingStatus: (...args: unknown[]) => status(...args),
}))
const join = vi.fn()
vi.mock("@/services/callService", () => ({ joinGuestMeetingAs: (...args: unknown[]) => join(...args) }))
const unlock = vi.fn()
vi.mock("@/services/roomService", () => ({ unlockRoom: (...args: unknown[]) => unlock(...args) }))
const answer = vi.fn()
vi.mock("@/services/guestKnock", () => ({
  answerGuestKnock: (...args: unknown[]) => answer(...args),
  leaveGuestKnock: vi.fn(async () => ({ ok: true, data: { left: true } })),
}))
vi.mock("@/components/livekit/PreJoin", () => ({
  PreJoin: ({ username, onJoin, joinError, extra }: { username: string; joinError?: string; extra?: React.ReactNode; onJoin: (v: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => void }) => {
    const [name, setName] = useState(username)
    return (
      <div>
        {joinError ? <p role="alert">{joinError}</p> : null}
        <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" onClick={() => onJoin({ audioEnabled: true, videoEnabled: false, displayName: name })}>Join call</button>
        {extra}
      </div>
    )
  },
}))
vi.mock("@/components/livekit/VideoConference", () => ({
  VideoConference: () => <div data-testid="call" />,
}))

import RoomPage from "@/app/r/[slug]/page"

const KEY = "onecamp.room-unlock.maya-chen"
const room = (k?: string) => ({ path: "/public/r/maya-chen", ...(k ? { k } : {}) })

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <RoomPage params={Promise.resolve({ slug: "maya-chen" })} />
      </Suspense>,
    )
  })
}

describe("a room's door", () => {
  it("is a link's token or a room's address with its unlock, asked with what follows it", () => {
    expect(doorPath(linkDoor("t/k"), "/join")).toBe("/guest/meet/t%2Fk/join")
    expect(doorPath(roomDoor("maya-chen"))).toBe("/public/r/maya-chen")
    expect(doorPath(roomDoor("maya-chen", "3.99.s+g"), "/knock/tk", { language: "en-GB", none: undefined })).toBe("/public/r/maya-chen/knock/tk?k=3.99.s%2Bg&language=en-GB")
    expect(roomLink("/r/maya-chen", "https://acme.example")).toBe("https://acme.example/r/maya-chen")
    expect(roomLink("", "https://acme.example")).toBe("")
  })

  it("keeps an unlock for the tab while it lasts, and forgets it", () => {
    sessionStorage.clear()
    keepUnlock("maya-chen", "opens", 60, 1_000)
    expect(keptUnlock("maya-chen", 1_000)).toBe("opens")
    expect(keptUnlock("maya-chen", 61_001)).toBeUndefined()
    expect(keptUnlock("ben")).toBeUndefined()
    dropUnlock("maya-chen")
    expect(sessionStorage.getItem(KEY)).toBeNull()
    sessionStorage.setItem(KEY, "not json")
    expect(keptUnlock("maya-chen")).toBeUndefined()
  })
})

describe("a personal room's address", () => {
  beforeEach(() => {
    sessionStorage.clear()
    status.mockReset()
    join.mockReset()
    unlock.mockReset()
    answer.mockReset()
  })
  afterEach(() => cleanup())

  it("asks for its passcode first, says a wrong one, and opens with the right one", async () => {
    status.mockImplementation(async (door: { k?: string }) =>
      door.k === "opens" ? { ok: true, data: { state: "live", title: "Maya Chen's room" } } : { ok: true, data: { state: "locked" } },
    )
    unlock.mockResolvedValueOnce({ ok: false, status: 401, msg: "That passcode doesn't open this room." }).mockResolvedValueOnce({ ok: true, data: { token: "opens", expires_in: 43200 } })
    await open()
    expect(await screen.findByRole("heading", { name: "This room needs a passcode" })).toBeInTheDocument()
    expect(screen.getByText("Whoever invited you has it.")).toBeInTheDocument()
    const field = screen.getByLabelText("Passcode") as HTMLInputElement
    expect(field.type).toBe("password")
    expect(screen.getByRole("button", { name: "Show the passcode" })).toBeInTheDocument()
    fireEvent.change(field, { target: { value: "1234" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })))
    expect(await screen.findByText("That passcode doesn't open this room.")).toBeInTheDocument()
    fireEvent.change(field, { target: { value: "4321" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })))
    expect(unlock).toHaveBeenLastCalledWith("maya-chen", "4321")
    // The green room, read at the room's address with its unlock, which is
    // kept for this tab and never put in the address.
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument()
    expect(status).toHaveBeenLastCalledWith(room("opens"))
    expect(JSON.parse(sessionStorage.getItem(KEY)!).k).toBe("opens")
    expect(window.location.search).toBe("")
    // Someone in the workspace comes in as themselves, with the unlock this tab keeps.
    expect(screen.getByRole("link", { name: "Join as yourself" }).getAttribute("href")).toBe("/app/meet/join/r/maya-chen")
  })

  it("knocks at the room's address with its unlock, waits by its name, and joins once let in", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ k: "opens", until: Date.now() + 60_000 }))
    status.mockResolvedValue({ ok: true, data: { state: "live", title: "Maya Chen's room" } })
    join.mockResolvedValue({ ok: true, data: { ticket: "tk" } })
    let letIn: (v: unknown) => void = () => {}
    answer.mockImplementationOnce(() => new Promise((r) => (letIn = r)))
    await open()
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Gia" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    expect(join.mock.calls[0].slice(0, 2)).toEqual([room("opens"), "Gia"])
    expect(await screen.findByRole("heading", { name: "Waiting to be let in" })).toBeInTheDocument()
    expect(document.querySelector("[data-guest-lobby-title]")?.textContent).toBe("Maya Chen's room")
    await waitFor(() => expect(answer).toHaveBeenCalled())
    expect(answer.mock.calls[0].slice(0, 2)).toEqual([room("opens"), "tk"])
    await act(async () => letIn({ ok: true, data: { token: "live" } }))
    expect(screen.getByTestId("call")).toBeInTheDocument()
  })

  it("asks for the passcode again once it changed, and forgets the old unlock", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ k: "stale", until: Date.now() + 60_000 }))
    status.mockResolvedValue({ ok: true, data: { state: "live", title: "Maya Chen's room" } })
    join.mockResolvedValue({ ok: false, status: 401, code: "locked", msg: "Enter the room's passcode to come in." })
    await open()
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Gia" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    expect(await screen.findByText("Its passcode has changed. Whoever invited you has the new one.")).toBeInTheDocument()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it("lets an event's invitee in with the key their invitation brought, and drops it from the address", async () => {
    window.history.replaceState(null, "", "/r/maya-chen#invitation=key%2F1")
    status.mockResolvedValue({ ok: true, data: { state: "live", title: "Design review" } })
    join.mockResolvedValue({ ok: true, data: { token: "live" } })
    await open()
    expect(window.location.hash).toBe("")
    expect(window.location.pathname).toBe("/r/maya-chen")
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Alex" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    expect(join.mock.calls[0].slice(0, 2)).toEqual([{ path: "/public/r/maya-chen", invitation: "key/1" }, "Alex"])
    expect(await screen.findByTestId("call")).toBeInTheDocument()
    expect(answer).not.toHaveBeenCalled()
    window.history.replaceState(null, "", "/")
  })

  it("says a room that isn't there any more is gone, and nothing about why", async () => {
    status.mockResolvedValue({ ok: false, status: 404, msg: "This link is no longer available." })
    await open()
    expect(await screen.findByRole("heading", { name: "This room doesn't exist or was deleted" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Passcode")).toBeNull()
  })
})
