import { Suspense, useState } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const joinGuestMeeting = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestMeetingStatus: async () => ({ ok: true, data: { title: "Acme weekly" } }),
}))
// The join carries the guest's language for the server's agent (callService).
vi.mock("@/services/callService", () => ({
  joinGuestMeetingAs: (...args: unknown[]) => joinGuestMeeting(...args),
}))
// The real join form and call need devices and a media server; these stand in
// with the same props.
vi.mock("@/components/livekit/PreJoin", () => ({
  PreJoin: ({ username, onJoin }: { username: string; onJoin: (v: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => void }) => {
    const [name, setName] = useState(username)
    return (
      <div>
        <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" onClick={() => onJoin({ audioEnabled: true, videoEnabled: false, displayName: name })}>Join call</button>
      </div>
    )
  },
}))
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
})
