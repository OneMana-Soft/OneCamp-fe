// CALL-BUG-11: a host can remove someone from the call, from their tile.
// Never their own, never an agent's, never without the right to.
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

describe("CALL-BUG-11: Remove from call, on a tile", () => {
  it("asks for the person when the host picks Remove from call", async () => {
    const onRemove = vi.fn()
    const priya = person("guest-g1-x", "Guest: Priya")
    render(<StageTile trackRef={priya as never} onRemove={onRemove} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Priya" }), { key: "Enter" })
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Remove from call" })))
    expect(onRemove).toHaveBeenCalledWith(priya.participant)
  })

  it("offers nothing on your own tile, or to someone who can't remove", () => {
    render(<StageTile trackRef={person("sam", "Sam Rivera", true) as never} onRemove={() => {}} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
    cleanup()
    render(<StageTile trackRef={person("maya", "Maya Chen") as never} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
  })
})
