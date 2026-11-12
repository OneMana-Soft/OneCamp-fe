// A person's connection on their tile (hub.md C5): a poor one is marked on
// their plate, and a lost one dims the tile with "Reconnecting…" over its
// picture. One tile body (TileBody) draws both, bare in the call's recording
// (H3, meet-17) and inside the call's own tile (StageTile), so each is asserted
// as both draw it (DESIGN-BUILD-124's F2).
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { ConnectionQuality, Track } from "livekit-client"

// How LiveKit rates the person's connection.
const room = vi.hoisted(() => ({ quality: "excellent" }))
vi.mock("@livekit/components-react", () => ({
  ParticipantTile: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  VideoTrack: () => null,
  useMaybeRoomContext: () => undefined,
  useConnectionQualityIndicator: () => ({ quality: room.quality }),
  useEnsureTrackRef: (t: unknown) => t,
  useIsMuted: () => false,
  useIsSpeaking: () => false,
}))

import { StageTile } from "./StageTile"
import { TileBody } from "./TileBody"

const maya = {
  participant: { identity: "maya", name: "Maya Chen", isLocal: false, attributes: {}, audioLevel: 0, getTrackPublication: () => undefined, on: () => {}, off: () => {} },
  source: Track.Source.Camera,
}

afterEach(() => {
  cleanup()
  room.quality = ConnectionQuality.Excellent
})

const plate = () => within(document.querySelector("[data-name-plate]") as HTMLElement)
const dimmed = () => (document.querySelector("[data-stage-tile]") as HTMLElement).classList.contains("opacity-60")

describe.each([
  ["the recording, which draws the tile bare", () => <TileBody trackRef={maya as never} />],
  ["the call, which draws it with its controls", () => <StageTile trackRef={maya as never} />],
])("a person's connection on their tile, in %s", (_, tile) => {
  it("marks a poor connection on their plate, and the tile stays lit", () => {
    room.quality = ConnectionQuality.Poor
    render(tile())
    expect(plate().getByLabelText("Poor connection")).toBeInTheDocument()
    expect(screen.queryByRole("status")).toBeNull()
    expect(dimmed()).toBe(false)
  })

  it("dims a lost connection's tile and says Reconnecting… over it", () => {
    room.quality = ConnectionQuality.Lost
    render(tile())
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
    expect(dimmed()).toBe(true)
    expect(screen.queryByLabelText("Poor connection")).toBeNull()
  })

  it("marks nothing on a good connection", () => {
    room.quality = ConnectionQuality.Good
    render(tile())
    expect(screen.getByText("Maya Chen")).toBeInTheDocument()
    expect(screen.queryByLabelText("Poor connection")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(dimmed()).toBe(false)
  })
})
