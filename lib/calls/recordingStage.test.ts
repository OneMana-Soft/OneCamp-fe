import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { RECORDING_VIEWPORT, recordingView, roomStageLayout, stageKey, type RoomStage, type StageView } from "./stageLayout"

// The recording draws the stage (H3, meet-17): the call and its recording build
// the same layout for the same room, through ONE builder (roomStageLayout). The
// recording is a screen that pinned nothing, on the grid's first page, in the
// mode the call takes by itself: speaker once someone is in the spotlight or a
// share begins, else the grid.

const cams = (n: number) => Array.from({ length: n }, (_, i) => stageKey(`p${i + 1}`, "camera"))
const share = stageKey("p2", "screen_share")
const rooms: Array<[string, RoomStage]> = [
  ["twelve people", { cameras: cams(12), presenting: [] }],
  ["twelve people and a spotlight", { cameras: cams(12), presenting: [], spotlight: "p3" }],
  ["twelve people and a share", { cameras: cams(12), presenting: [share], speaker: stageKey("p5", "camera") }],
  ["a share and a spotlight", { cameras: cams(12), presenting: [share], spotlight: "p3" }],
  ["sixty people", { cameras: cams(60), presenting: [] }],
  ["nobody yet", { cameras: [], presenting: [] }],
]

describe("the call and its recording", () => {
  it.each(rooms)("recordingView is a view with no pin, on the first page, in speaker mode once a spotlight or a share begins: %s", (_, room) => {
    // recordingView's formula, written out: no pin, the first page, the recording's viewport, and the mode a
    // spotlight or a beginning share puts a call in (VideoConference sets speaker on both). It pins
    // recordingView; it doesn't read VideoConference.
    const untouched: StageView = { pin: null, mode: room.spotlight || room.presenting.length > 0 ? "speaker" : "grid", viewport: RECORDING_VIEWPORT, page: 0 }
    expect(roomStageLayout(room, recordingView(room))).toEqual(roomStageLayout(room, untouched))
  })

  it("draws twelve in one grid, the spotlight with the strip and +N, and a share in focus", () => {
    const grid = roomStageLayout(rooms[0][1], recordingView(rooms[0][1]))
    expect(grid.grid).toMatchObject({ cols: 4, rows: 3, pages: 1, page: 0 })
    expect(grid.grid?.keys).toHaveLength(12)

    const spot = roomStageLayout(rooms[1][1], recordingView(rooms[1][1]))
    expect(spot.grid).toBeNull()
    expect(spot.focus.keys).toEqual([stageKey("p3", "camera")])
    expect(spot.strip.keys.length + spot.strip.more).toBe(11)
    expect(spot.strip.more).toBeGreaterThan(1)

    const shared = roomStageLayout(rooms[2][1], recordingView(rooms[2][1]))
    expect(shared.focus.keys).toEqual([share])
    expect(shared.strip.keys.length + shared.strip.more).toBe(12)
  })

  it("draws the first page past 49, and an empty room's empty stage", () => {
    const many = roomStageLayout(rooms[4][1], recordingView(rooms[4][1]))
    expect(many.grid).toMatchObject({ cols: 7, rows: 7, page: 0, pages: 2 })
    expect(roomStageLayout(rooms[5][1], recordingView(rooms[5][1])).grid?.keys).toEqual([])
  })

  it("is the one builder: the call's stage and the recording's call roomStageLayout, never stageLayout itself", () => {
    for (const file of ["components/livekit/VideoConference.tsx", "components/livekit/RecordingStage.tsx"]) {
      const src = readFileSync(file, "utf8")
      expect(src, file).toMatch(/\broomStageLayout\(/)
      expect(src, file).not.toMatch(/[^.\w]stageLayout\(/)
    }
  })

  it("is the one tile: the call's and the recording's draw TileBody, and neither a picture, face, ring or plate of its own", () => {
    for (const file of ["components/livekit/StageTile.tsx", "components/livekit/RecordingStage.tsx"]) {
      const src = readFileSync(file, "utf8")
      expect(src, file).toMatch(/<TileBody\b/)
      expect(src, file).not.toMatch(/<(VideoTrack|StageFace|CameraOffFace|SpeakingRing|NamePlate)\b/)
    }
  })
})
