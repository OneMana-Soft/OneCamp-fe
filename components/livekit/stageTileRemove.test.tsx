// CALL-BUG-11 and Call Control: whoever runs a call acts on someone from their
// tile. Never on their own, never on an agent's, never without the right to.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { Track } from "livekit-client"

// What the room says of the person: muted, and speaking by its voice detector.
const room = vi.hoisted(() => ({ muted: true, speaking: false }))
vi.mock("@livekit/components-react", () => ({
  ParticipantTile: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  VideoTrack: () => null,
  useConnectionQualityIndicator: () => ({ quality: "good" }),
  useEnsureTrackRef: (t: unknown) => t,
  useIsMuted: () => room.muted,
  useIsSpeaking: () => room.speaking,
}))

import { StageTile } from "./StageTile"

const person = (identity: string, name: string, isLocal = false, attributes: Record<string, string> = {}, audioLevel = 0) => ({
  participant: { identity, name, isLocal, attributes, audioLevel, getTrackPublication: () => undefined, on: () => {}, off: () => {} },
  source: Track.Source.Camera,
})

afterEach(() => {
  cleanup()
  room.muted = true
  room.speaking = false
})

// The voice detector lags a closed microphone by a moment, so a ring drawn
// from it alone said "still on air" after push to talk let go (meet-18,
// DESIGN-BUILD-18's SF1): a muted microphone never draws the ring.
describe("the speaking ring", () => {
  const ring = () => Number((document.querySelector("[data-speaking-ring]") as HTMLElement).style.opacity || 0)

  it("rings someone speaking with their microphone open, and never someone whose microphone is closed", () => {
    room.speaking = true
    room.muted = false
    render(<StageTile trackRef={person("sam", "Sam Rivera", true, {}, 0.8) as never} />)
    expect(ring()).toBeGreaterThan(0)
    cleanup()
    room.muted = true
    render(<StageTile trackRef={person("sam", "Sam Rivera", true, {}, 0.8) as never} />)
    expect(ring()).toBe(0)
  })
})

describe("CALL-BUG-11 and Call Control: a person's actions, on their tile", () => {
  const remove = { action: "remove" as const, label: "Remove from call", danger: true }
  const mute = { action: "mute" as const, source: "microphone" as const, label: "Mute" }

  it("offers what whoever runs the call may do to this person, and asks for them when one is picked", async () => {
    const onAction = vi.fn()
    const priya = person("guest-g1-x", "Guest: Priya")
    render(<StageTile trackRef={priya as never} actionsFor={() => [mute, remove]} onAction={onAction} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Priya" }), { key: "Enter" })
    expect((await screen.findAllByRole("menuitem", undefined, { timeout: 5000 })).map((m) => m.textContent)).toEqual(["Mute", "Remove from call"])
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Remove from call" })))
    expect(onAction).toHaveBeenCalledWith(remove, priya.participant)
  })

  it("offers nothing on your own tile, to someone who runs nothing, or where there is nothing to do", () => {
    render(<StageTile trackRef={person("sam", "Sam Rivera", true) as never} actionsFor={() => [remove]} onAction={() => {}} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
    cleanup()
    render(<StageTile trackRef={person("maya", "Maya Chen") as never} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
    cleanup()
    render(<StageTile trackRef={person("maya", "Maya Chen") as never} actionsFor={() => []} onAction={() => {}} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
  })
})

// Someone let in by the call's invite is marked on their tile, as the server
// names their part (calls HU13; DESIGN-BUILD-4, 22 Oct).
describe("an invitee's tile", () => {
  it("says Invited for someone the server names an invitee, and nothing for a member", () => {
    render(<StageTile trackRef={person("0xkai", "Kai Lin", false, { "oc.role": "invitee" }) as never} />)
    expect(screen.getByText("Invited")).toBeTruthy()
    cleanup()
    render(<StageTile trackRef={person("maya", "Maya Chen", false, { "oc.role": "participant" }) as never} />)
    expect(screen.queryByText("Invited")).toBeNull()
  })
})
