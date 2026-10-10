import { Suspense, useState } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const joinGuestMeeting = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestMeetingStatus: async () => ({ ok: true, data: { title: "Acme weekly" } }),
  joinGuestMeeting: (...args: unknown[]) => joinGuestMeeting(...args),
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
  VideoConference: ({ onDisconnect }: { onDisconnect: () => void }) => (
    <button type="button" data-testid="call" onClick={onDisconnect}>Leave</button>
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
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("heading", { level: 1, name: "You left the meeting" })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join again" })))
    expect(screen.getByLabelText("Your name")).toHaveValue("Jordan")
  })
})
