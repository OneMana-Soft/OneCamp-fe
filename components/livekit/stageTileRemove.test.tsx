// CALL-BUG-11 and Call Control: whoever runs a call acts on someone from their
// tile. Never on their own, never on an agent's, never without the right to.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { Track } from "livekit-client"

vi.mock("@livekit/components-react", () => ({
  ParticipantTile: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  VideoTrack: () => null,
  useConnectionQualityIndicator: () => ({ quality: "good" }),
  useEnsureTrackRef: (t: unknown) => t,
  useIsMuted: () => true,
  useIsSpeaking: () => false,
}))

import { StageTile } from "./StageTile"

const person = (identity: string, name: string, isLocal = false) => ({
  participant: { identity, name, isLocal, audioLevel: 0, getTrackPublication: () => undefined },
  source: Track.Source.Camera,
})

afterEach(() => cleanup())

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
