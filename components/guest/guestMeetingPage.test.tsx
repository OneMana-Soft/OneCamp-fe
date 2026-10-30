import { Suspense, useState } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const joinGuestMeeting = vi.fn()
const getGuestMeetingStatus = vi.fn(async () => ({ ok: true, data: { title: "Acme weekly" } as Record<string, unknown> }))
vi.mock("@/services/guestDoor", async (orig) => ({
  ...(await orig<typeof import("@/services/guestDoor")>()),
  getGuestMeetingStatus: () => getGuestMeetingStatus(),
}))
// The join carries the guest's language for the server's agent (callService).
vi.mock("@/services/callService", () => ({
  joinGuestMeetingAs: (...args: unknown[]) => joinGuestMeeting(...args),
}))
// A knock on a meeting's lobby, asked until someone answers (CALLS-2).
const answerGuestKnock = vi.fn()
const leaveGuestKnock = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true, data: { left: true } }))
vi.mock("@/services/guestKnock", () => ({
  answerGuestKnock: (...args: unknown[]) => answerGuestKnock(...args),
  leaveGuestKnock: (...args: unknown[]) => leaveGuestKnock(...args),
}))
// The real join form and call need devices and a media server; these stand in
// with the same props.
vi.mock("@/components/livekit/PreJoin", () => ({
  PreJoin: ({ username, onJoin, recordingBy, joinError, extra, instead }: { username: string; recordingBy?: string | null; joinError?: string; extra?: React.ReactNode; instead?: (choice: { audioEnabled: boolean; videoEnabled: boolean }) => React.ReactNode; onJoin: (v: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => void }) => {
    const [name, setName] = useState(username)
    // Another first way in takes the name and Join's place (calls HU13).
    const lead = instead?.({ audioEnabled: true, videoEnabled: false })
    return (
      <div>
        {recordingBy ? <p>Recorded by {recordingBy}</p> : null}
        {joinError ? <p role="alert">{joinError}</p> : null}
        {lead ?? (
          <>
            <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" onClick={() => onJoin({ audioEnabled: true, videoEnabled: false, displayName: name })}>Join call</button>
          </>
        )}
        {extra}
      </div>
    )
  },
}))
// Who is signed in here: the session check (lib/auth/sessionMember), asked
// only in a browser a member has used (lib/appBoot's mark).
const activeMember = vi.fn<() => Promise<{ uuid: string; name: string } | null>>(async () => null)
vi.mock("@/lib/auth/sessionMember", () => ({ activeMember: () => activeMember() }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }))
vi.mock("@/components/livekit/VideoConference", () => ({
  VideoConference: ({ onDisconnect, onConnected }: { onDisconnect: (end?: unknown) => void; onConnected?: () => void }) => (
    <>
      <button type="button" data-testid="call" onClick={() => onDisconnect()}>Leave</button>
      <button type="button" onClick={() => onConnected?.()}>Connected</button>
      <button type="button" onClick={() => onDisconnect({ removed: { reason: "host", by: "Maya Chen" } })}>Removed by the host</button>
      <button type="button" onClick={() => onDisconnect({ failed: "network" })}>Network failed</button>
    </>
  ),
}))

import GuestMeetingPage from "@/app/guest/m/[token]/page"

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestMeetingPage params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}

describe("a guest in a meeting", () => {
  afterEach(() => cleanup())

  // HU13: someone in the workspace comes in as themselves, in the app.
  it("offers someone in the workspace to join as themselves", async () => {
    await open()
    expect(screen.getByRole("link", { name: "Join as yourself" }).getAttribute("href")).toBe("/app/meet/join/tok")
  })

  it("fills the screen the phone actually shows", async () => {
    joinGuestMeeting.mockResolvedValue({ ok: true, data: { token: "live" } })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    const frame = screen.getByTestId("call").parentElement!
    expect(frame.className).toMatch(/\bh-dvh\b/)
    expect(frame.className).not.toMatch(/\b(h|w)-screen\b/)
  })

  it("can rejoin after dropping out, as the same name", async () => {
    joinGuestMeeting.mockResolvedValue({ ok: true, data: { token: "live" } })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connected" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("heading", { level: 1, name: "You left the meeting" })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join again" })))
    expect(screen.getByLabelText("Your name")).toHaveValue("Jordan")
  })

  // Call Control: a meeting its host locked keeps out a guest, who is told so
  // in the green room and can try again once it's unlocked; the link isn't dead.
  it("says the meeting is locked, and keeps the guest where they can try again", async () => {
    joinGuestMeeting.mockResolvedValue({ ok: false, status: 403, code: "call_locked", msg: "This call is locked, so nobody new can join it." })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    expect(screen.getByRole("alert").textContent).toBe("This meeting is locked, so nobody new can join it. Ask the host to unlock it, then try again.")
    expect(screen.getByRole("button", { name: "Join call" })).toBeInTheDocument()
  })

  // CALL-BUG-11: removed by the host, the guest reads why and isn't offered
  // a way straight back into the meeting.
  it("says the host removed them, with no Join again", async () => {
    joinGuestMeeting.mockResolvedValue({ ok: true, data: { token: "live" } })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Removed by the host" })))
    expect(screen.getByRole("heading", { level: 1, name: "You were removed from the meeting" })).toBeInTheDocument()
    expect(screen.getByText(/Maya Chen removed you from this meeting\./)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Join again" })).toBeNull()
  })

  // Calls audit: the guest's green room read the meeting once, so a
  // recording that started while they decided wasn't said before Join.
  it("says a recording that starts while the guest is in the green room", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
    try {
      await open()
      expect(screen.queryByText(/Recorded by/)).toBeNull()
      getGuestMeetingStatus.mockResolvedValue({ ok: true, data: { title: "Acme weekly", recording: { on: true, by: "Maya Chen" } } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(screen.getByText("Recorded by Maya Chen")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // CALL-BUG-23: a meeting that never connected said "You left the meeting"
  // within five seconds, with no reason.
  it("says a meeting that never connected couldn't, why, and offers Try again", async () => {
    joinGuestMeeting.mockResolvedValue({ ok: true, data: { token: "live" } })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Network failed" })))
    expect(screen.getByRole("heading", { level: 1, name: "Couldn't connect to the meeting" })).toBeInTheDocument()
    expect(screen.getByText(/Check your connection/)).toBeInTheDocument()
    expect(screen.queryByText(/You left/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(screen.getByLabelText("Your name")).toHaveValue("Jordan")
  })

  // CALLS-2: a meeting whose guests wait in its lobby. The guest knocks, is
  // told they're waiting, and joins when let in; turned away, they're told so.
  describe("in the lobby", () => {
    const knock = async () => {
      joinGuestMeeting.mockResolvedValue({ ok: true, data: { waiting: true, ticket: "tk" } })
      await open()
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
    }

    it("waits, said by name, and joins once let in", async () => {
      let letIn: (v: unknown) => void = () => {}
      answerGuestKnock.mockResolvedValueOnce({ ok: true, data: { waiting: true } }).mockImplementationOnce(() => new Promise((r) => (letIn = r)))
      await knock()
      // The lobby's card and its wait load with the knock.
      expect(await screen.findByRole("heading", { name: "Waiting to be let in" })).toBeInTheDocument()
      expect(document.querySelector("[data-guest-lobby-name]")?.textContent).toBe("Jordan")
      // It names the call they're waiting for, from the link's status.
      expect(document.querySelector("[data-guest-lobby-title]")?.textContent).toBe("Acme weekly")
      expect(screen.getByText(/can see you're here\./)).toBeInTheDocument()
      await waitFor(() => expect(answerGuestKnock).toHaveBeenCalledTimes(2))
      // Asked at the door it came by: the link's token.
      expect(answerGuestKnock.mock.calls[0].slice(0, 2)).toEqual([{ path: "/guest/meet/tok" }, "tk"])
      expect(answerGuestKnock.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
      await act(async () => letIn({ ok: true, data: { token: "live" } }))
      expect(screen.queryByRole("heading", { name: "Waiting to be let in" })).toBeNull()
      expect(screen.getByTestId("call")).toBeInTheDocument()
    })

    it("says they weren't let in, and keeps them where they can ask again", async () => {
      answerGuestKnock.mockReset().mockResolvedValue({ ok: false, status: 403, code: "denied", msg: "denied" })
      await knock()
      expect((await screen.findByRole("alert")).textContent).toBe("Someone running the meeting didn't let you in. Ask the host if you think that's a mistake.")
      expect(screen.getByRole("button", { name: "Join call" })).toBeInTheDocument()
    })

    it("stops waiting at once on Leave, and tells the server", async () => {
      let signal: AbortSignal | undefined
      answerGuestKnock.mockReset().mockImplementation(
        (_t: unknown, _k: unknown, _l: unknown, s: AbortSignal) =>
          new Promise((r) => {
            signal = s
            s.addEventListener("abort", () => r({ ok: false, status: 0, msg: "aborted" }))
          }),
      )
      await knock()
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Leave" })))
      expect(signal?.aborted).toBe(true)
      await waitFor(() => expect(leaveGuestKnock).toHaveBeenCalledWith({ path: "/guest/meet/tok" }, "tk"))
      expect(screen.queryByRole("heading", { name: "Waiting to be let in" })).toBeNull()
      expect(screen.getByRole("button", { name: "Join call" })).toBeInTheDocument()
      expect(screen.queryByRole("alert")).toBeNull()
    })
  })

  // HU13 (DESIGN-BUILD-4, 22 Oct): Meet knows a signed-in colleague at its
  // link without a click. Ours leads with "Join as Kai Lin" when this browser
  // holds the workspace's session, the guest's form folded under it; a
  // browser no member has used asks nobody's session.
  describe("someone signed in to the workspace, at its link", () => {
    afterEach(() => {
      localStorage.clear()
      sessionStorage.clear()
      activeMember.mockReset()
      activeMember.mockResolvedValue(null)
      push.mockReset()
      joinGuestMeeting.mockReset()
    })

    it("asks nobody's session in a browser no member has used, and keeps the line under Join, a finger's target", async () => {
      await open()
      const line = screen.getByRole("link", { name: "Join as yourself" })
      expect(line.hasAttribute("data-touch-target")).toBe(true)
      expect(screen.getByLabelText("Your name")).toBeInTheDocument()
      expect(activeMember).not.toHaveBeenCalled()
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Joining as a guest")
    })

    it("leads with Join as Kai Lin, which goes in as them with the choices made here", async () => {
      localStorage.setItem("onecamp:member", "1")
      activeMember.mockResolvedValue({ uuid: "33333333-3333-4333-8333-333333333333", name: "Kai Lin" })
      await open()
      const join = await screen.findByRole("button", { name: "Join as Kai Lin" })
      // The header follows the choice (DESIGN-BUILD-4, 22 Oct): who joins, with their face.
      const heading = screen.getByRole("heading", { level: 1 })
      expect(heading.textContent).toContain("Joining as Kai Lin")
      expect(heading.textContent).not.toContain("guest")
      expect(heading.querySelector("[data-joining-as]")).not.toBeNull()
      expect(screen.queryByLabelText("Your name")).toBeNull()
      expect(screen.queryByRole("link", { name: "Join as yourself" })).toBeNull()
      await act(async () => fireEvent.click(join))
      expect(push).toHaveBeenCalledWith("/app/meet/join/tok")
      expect(JSON.parse(sessionStorage.getItem("onecamp:door-join") || "{}")).toMatchObject({ path: "/app/meet/join/tok", audioEnabled: true, videoEnabled: false })
    })

    it("joins as a guest instead when asked, by the guest's own form", async () => {
      localStorage.setItem("onecamp:member", "1")
      activeMember.mockResolvedValue({ uuid: "33333333-3333-4333-8333-333333333333", name: "Kai Lin" })
      joinGuestMeeting.mockResolvedValue({ ok: true, data: { token: "live" } })
      await open()
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Join as a guest instead" })))
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Joining as a guest")
      fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Kai" } })
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join call" })))
      expect(joinGuestMeeting).toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
      expect(sessionStorage.getItem("onecamp:door-join")).toBeNull()
    })

    it("keeps the guest's page when the session has ended", async () => {
      localStorage.setItem("onecamp:member", "1")
      await open()
      await waitFor(() => expect(activeMember).toHaveBeenCalledTimes(1))
      expect(screen.getByLabelText("Your name")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Join as yourself" })).toBeInTheDocument()
    })
  })
})
