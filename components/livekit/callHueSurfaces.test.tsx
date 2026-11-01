// Each person's colour in a call (V-190) on every surface that draws them, beside
// their ink and speaking ring: the face of someone whose camera is off, and their
// name over their captions. Two people whose names hash to one hue are told apart
// on each, by the call's one sheet (callHues).
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Track } from "livekit-client"

// The room's own hooks stay real (the sheet reads the room); a camera-off face only asks whether the camera is muted.
vi.mock("@livekit/components-react", async (actual) => ({ ...(await actual<typeof import("@livekit/components-react")>()), useIsMuted: () => true }))

import { RoomContext } from "@livekit/components-react"
import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { personHue } from "@/lib/utils/getAvatarColor"
import { fakeCallRoom } from "@/lib/testing/callRoom"
import { CaptionsOverlay } from "./CallStage"
import { useCallHues } from "./callHues"
import { CameraOffFace } from "./StageTile"

const at = (s: number) => new Date(s * 1000)

/** You are Jo Park; Sam Rivera joined before Lena Ortiz, and both names hash to lake. */
function sameHueRoom() {
  const f = fakeCallRoom()
  Object.assign(f.room.localParticipant, { sid: "PA_jo", name: "Jo Park", joinedAt: at(5) })
  const sam = Object.assign(f.room.remoteParticipants.get("ana")!, { sid: "PA_ana", name: "Sam Rivera", joinedAt: at(10) })
  const lena = Object.assign(f.room.remoteParticipants.get("ben")!, { sid: "PA_ben", name: "Lena Ortiz", joinedAt: at(20) })
  return { room: f.room, sam, lena }
}

/** The sheet's colour for each of them, read as every surface reads it. */
function sheetOf(room: ReturnType<typeof fakeCallRoom>["room"]) {
  const seen: Record<string, CampHue> = {}
  function Sheet() {
    const hueOf = useCallHues()
    seen.sam = hueOf("ana", "Sam Rivera")
    seen.lena = hueOf("ben", "Lena Ortiz")
    return null
  }
  render(
    <RoomContext.Provider value={room as never}>
      <Sheet />
    </RoomContext.Provider>,
  )
  cleanup()
  return seen
}

afterEach(() => cleanup())

describe("a person's colour on every surface of a call", () => {
  it("draws the face of someone whose camera is off in their colour from the call's sheet", () => {
    expect(personHue("Lena Ortiz")).toBe(personHue("Sam Rivera"))
    const { room, sam, lena } = sameHueRoom()
    const sheet = sheetOf(room)
    expect(sheet.lena).not.toBe(sheet.sam)
    const { container } = render(
      <RoomContext.Provider value={room as never}>
        <div data-who="sam">
          <CameraOffFace trackRef={{ participant: sam, source: Track.Source.Camera } as never} />
        </div>
        <div data-who="lena">
          <CameraOffFace trackRef={{ participant: lena, source: Track.Source.Camera } as never} />
        </div>
      </RoomContext.Provider>,
    )
    const face = (who: string) => container.querySelector(`[data-who="${who}"] [data-hue]`)?.getAttribute("data-hue")
    expect(face("sam")).toBe(sheet.sam)
    // Her own hash says lake, Sam's; the sheet gives her the next colour, as her ink and ring have.
    expect(face("lena")).toBe(sheet.lena)
  })

  it("names each speaker over their captions in the same colour", () => {
    const { room } = sameHueRoom()
    const sheet = sheetOf(room)
    function Captions() {
      const hueOf = useCallHues()
      return (
        <CaptionsOverlay
          idleMessage="Captions are on"
          hueOf={hueOf}
          entries={[
            { identity: "ana", name: "Sam Rivera", text: "Shall we start?" },
            { identity: "ben", name: "Lena Ortiz", text: "Yes, the launch plan first." },
          ]}
        />
      )
    }
    render(
      <RoomContext.Provider value={room as never}>
        <Captions />
      </RoomContext.Provider>,
    )
    const named = (name: string) => screen.getByText(name).className.split(/\s+/)
    expect(named("Sam Rivera")).toContain(HUE_CLASS[sheet.sam])
    expect(named("Lena Ortiz")).toContain(HUE_CLASS[sheet.lena])
    expect(named("Lena Ortiz")).not.toContain(HUE_CLASS[personHue("Lena Ortiz")])
  })
})
