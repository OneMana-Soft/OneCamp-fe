import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { FRAME_PRESETS, frameLink, frameOrderOf, framePreset, layoutFrame, linkedFromSearch, moveFrame, nextFrameName, orderFrames } from "./frames"

const item = (id: string, x: number, y: number, w = 180, h = 180) => ({ id, x, y, width: w, height: h })

describe("frame presets", () => {
  it("are Miro's formats, each its own shape", () => {
    expect(FRAME_PRESETS.map((p) => p.id)).toEqual(["16:9", "4:3", "1:1", "a4", "letter", "desktop", "tablet", "phone"])
    expect(framePreset("16:9")).toMatchObject({ width: 1920, height: 1080 })
    expect(framePreset("a4")!.height / framePreset("a4")!.width).toBeCloseTo(Math.SQRT2, 2)
    expect(framePreset("nope")).toBeNull()
  })

  it("name a new frame after the last, skipping a name in use", () => {
    expect(nextFrameName([])).toBe("Frame 1")
    expect(nextFrameName(["Frame 1", "Retro"])).toBe("Frame 3")
    expect(nextFrameName(["Frame 2"])).toBe("Frame 3")
    expect(nextFrameName(["Slide 2", null], "Slide")).toBe("Slide 3")
  })
})

describe("a frame's layout", () => {
  const frame = { x: 0, y: 0, width: 700, height: 500 }
  const notes = [item("c", 400, 10), item("a", 0, 0), item("b", 200, 5), item("d", 50, 300)]

  it("puts notes in a grid of equal cells, in reading order, inside the frame's padding", () => {
    const { positions, width, height } = layoutFrame(frame, notes, "grid")
    // 700 wide less 80 of padding holds three 180 cells with 24 between.
    expect(positions.get("a")).toEqual({ x: 40, y: 40 })
    expect(positions.get("b")).toEqual({ x: 244, y: 40 })
    expect(positions.get("c")).toEqual({ x: 448, y: 40 })
    expect(positions.get("d")).toEqual({ x: 40, y: 244 })
    expect(width).toBe(700)
    expect(height).toBe(500)
  })

  it("wraps rows at the frame's width, and grows the frame to hold them", () => {
    // 720 wide less 80 of padding takes two 300-wide notes and the gap between.
    const wide = [item("a", 0, 0, 300, 100), item("b", 400, 0, 300, 120), item("c", 800, 0, 300, 100)]
    const { positions, height } = layoutFrame({ ...frame, width: 720 }, wide, "rows")
    expect(positions.get("a")).toEqual({ x: 40, y: 40 })
    expect(positions.get("b")).toEqual({ x: 364, y: 40 })
    expect(positions.get("c")).toEqual({ x: 40, y: 184 })
    expect(height).toBe(500)
    const tall = layoutFrame({ x: 0, y: 0, width: 400, height: 200 }, [item("a", 0, 0), item("b", 0, 300)], "rows")
    expect(tall.height).toBe(180 * 2 + 24 + 80)
  })

  it("wraps columns at the frame's height", () => {
    const { positions, width } = layoutFrame({ x: 100, y: 100, width: 300, height: 500 }, notes, "columns")
    expect(positions.get("a")).toEqual({ x: 140, y: 140 })
    expect(positions.get("b")).toEqual({ x: 140, y: 344 })
    expect(positions.get("c")).toEqual({ x: 344, y: 140 })
    expect(positions.get("d")).toEqual({ x: 344, y: 344 })
    expect(width).toBe(180 * 2 + 24 + 80)
  })

  it("leaves an empty frame as it is", () => {
    expect(layoutFrame(frame, [], "grid")).toEqual({ positions: new Map(), width: 700, height: 500 })
  })
})

describe("the frames' order", () => {
  const frames = [item("f3", 0, 2000), item("f1", 0, 0), item("f2", 2500, 0), item("f4", 1200, 30)]

  it("follows the board's kept order, then reading order for frames not in it", () => {
    expect(orderFrames(frames, null).map((f) => f.id)).toEqual(["f1", "f4", "f2", "f3"])
    expect(orderFrames(frames, ["f2", "gone", "f3"]).map((f) => f.id)).toEqual(["f2", "f3", "f1", "f4"])
  })

  it("moves one frame to a new place", () => {
    expect(moveFrame(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"])
    expect(moveFrame(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    expect(moveFrame(["a", "b"], 5, 0)).toEqual(["a", "b"])
  })
})

describe("a link to a frame", () => {
  it("opens the board there, and reads back", () => {
    const link = frameLink("https://work.example.com/", "b-1", "frame 7")
    expect(link).toBe("https://work.example.com/app/board/b-1?frame=frame%207")
    expect(linkedFromSearch(new URL(link).search)).toBe("frame 7")
    expect(linkedFromSearch("?x=1")).toBeNull()
    expect(linkedFromSearch(`?frame=${"x".repeat(300)}`)).toBeNull()
  })
})

describe("a link to an element", () => {
  it("is read as Excalidraw's own Copy link to object writes it: an element's id or a group's", () => {
    expect(linkedFromSearch("?element=note-3")).toBe("note-3")
    expect(linkedFromSearch(`?element=${"x".repeat(300)}`)).toBeNull()
  })
})

describe("the frames' kept order, read from a board's boardMeta", () => {
  it("is the frame ids the Frames panel kept, and nothing else", () => {
    const meta = new Y.Doc().getMap<unknown>("boardMeta")
    expect(frameOrderOf(meta)).toBeNull()
    meta.set("frameOrder", ["f2", 7, null, "f1"])
    expect(frameOrderOf(meta)).toEqual(["f2", "f1"])
    meta.set("frameOrder", "f1")
    expect(frameOrderOf(meta)).toBeNull()
  })
})
