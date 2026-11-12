import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { FRAME_PRESETS, frameHolding, frameLink, findFromSearch, frameOrderOf, framePreset, holds, layoutFrame, linkedFromSearch, moveFrame, nextFrameName, orderFrames, placeInFrame } from "./frames"

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

describe("the frame a box belongs in (miro-11 F2)", () => {
  const f = (id: string, x: number, y: number, extra: { isDeleted?: boolean; type?: string } = {}) => ({ id, type: "frame", x, y, width: 400, height: 300, ...extra })
  it("holds a box wholly inside, edges touching included, and never one that crosses an edge", () => {
    expect(holds({ x: 0, y: 0, width: 400, height: 300 }, { x: 0, y: 0, width: 400, height: 300 })).toBe(true)
    expect(holds({ x: 0, y: 0, width: 400, height: 300 }, { x: 100, y: 100, width: 180, height: 180 })).toBe(true)
    expect(holds({ x: 0, y: 0, width: 400, height: 300 }, { x: 300, y: 100, width: 180, height: 180 })).toBe(false)
    expect(holds({ x: 0, y: 0, width: 400, height: 300 }, { x: -1, y: 100, width: 10, height: 10 })).toBe(false)
  })
  it("is the topmost live frame that wholly holds the box, or none", () => {
    const box = { x: 120, y: 120, width: 180, height: 180 }
    const under = f("under", 0, 0)
    const over = f("over", 100, 100)
    const shape = { id: "s", type: "rectangle", x: 0, y: 0, width: 1000, height: 1000 }
    expect(frameHolding([under, over, shape], box)?.id).toBe("over")
    expect(frameHolding([over, under], box)?.id).toBe("under")
    expect(frameHolding([under, f("gone", 100, 100, { isDeleted: true })], box)?.id).toBe("under")
    expect(frameHolding([shape], box)).toBeNull()
    expect(frameHolding([f("off", 200, 200)], box)).toBeNull()
  })
})

// DESIGN-BUILD-120 F1 (6 Nov): a note placed with its centre in a frame but across its edge looked in the frame and was
// in none, so Lay out passed it by and the panel said Empty. It joins the frame under its centre, wholly inside.
describe("a note placed on a point (DESIGN-BUILD-120 F1)", () => {
  const f = (id: string, x: number, y: number, width = 600, height = 500, extra: { isDeleted?: boolean } = {}) => ({ id, type: "frame", x, y, width, height, ...extra })
  const at = (cx: number, cy: number, side = 180) => ({ x: cx - side / 2, y: cy - side / 2, width: side, height: side })

  it("joins the frame under its centre though it crosses an edge: in off the left and top, the frame grown past the right and bottom", () => {
    const ideas = f("ideas", 100, 100)
    // Centred 60 px inside the left edge, the note crosses it by 30: it moves right to the padding (40), no further.
    const edge = placeInFrame([ideas], at(160, 350))
    expect(edge.frame?.id).toBe("ideas")
    expect(edge.box).toEqual({ x: 140, y: 260, width: 180, height: 180 })
    expect(holds(ideas, edge.box)).toBe(true)
    expect(edge.grown).toBeNull()
    // At the bottom right corner, 60 px in from both edges: it stays where it was put, and the frame grows right and down
    // to hold it inside its padding, as Lay out's frames grow; pulled back, a Tab run's note fell on the last (V-683).
    const corner = placeInFrame([ideas], at(640, 540))
    expect(corner.frame?.id).toBe("ideas")
    expect(corner.box).toEqual({ x: 550, y: 450, width: 180, height: 180 })
    expect(corner.grown).toEqual({ width: 670, height: 570 })
    expect(holds({ ...ideas, ...corner.grown }, corner.box)).toBe(true)
  })

  it("leaves a note the frame already wholly holds where it was put", () => {
    const placed = placeInFrame([f("ideas", 100, 100)], at(300, 300))
    expect(placed).toEqual({ frame: f("ideas", 100, 100), box: at(300, 300), grown: null })
  })

  it("grows a frame smaller than the note, as Lay out's does: to the right and down, the note inside its padding", () => {
    const small = f("small", 0, 0, 100, 80)
    const placed = placeInFrame([small], at(50, 40))
    expect(placed.frame?.id).toBe("small")
    expect(placed.grown).toEqual({ width: 260, height: 260 })
    expect(placed.box).toEqual({ x: 40, y: 40, width: 180, height: 180 })
    // The very size and place Lay out gives the same note in the same frame.
    const laid = layoutFrame(small, [{ id: "n", ...at(50, 40) }], "grid")
    expect({ width: laid.width, height: laid.height }).toEqual(placed.grown)
    expect(laid.positions.get("n")).toEqual({ x: placed.box.x, y: placed.box.y })
  })

  it("goes by its centre: 10 px inside an edge joins, 10 px outside stays in no frame and isn't moved", () => {
    expect(placeInFrame([f("ideas", 100, 100)], at(110, 300))).toMatchObject({ frame: { id: "ideas" }, box: { x: 140, y: 210 } })
    // Centred 10 px left of the frame's edge: mostly over the frame, and in none, as before.
    const box = at(90, 300)
    expect(placeInFrame([f("ideas", 100, 100)], box)).toEqual({ frame: null, box, grown: null })
    expect(placeInFrame([{ id: "s", type: "rectangle", x: 0, y: 0, width: 1000, height: 1000 }], at(300, 300)).frame).toBeNull()
  })

  it("takes the topmost of two frames under its centre, and never a deleted one", () => {
    const under = f("under", 0, 0, 1000, 1000)
    const over = f("over", 400, 0, 600, 600)
    // The centre in both: the one on top (the last in scene order) takes it, nudged inside its left edge.
    const top = placeInFrame([under, over], at(430, 300))
    expect(top.frame?.id).toBe("over")
    expect(top.box.x).toBe(440)
    const below = placeInFrame([over, under], at(430, 300))
    expect(below.frame?.id).toBe("under")
    expect(below.box.x).toBe(340)
    expect(placeInFrame([under, f("gone", 400, 0, 600, 600, { isDeleted: true })], at(430, 300)).frame?.id).toBe("under")
    expect(placeInFrame([f("gone", 400, 0, 600, 600, { isDeleted: true })], at(430, 300)).frame).toBeNull()
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

  it("is not the words a search hit asks the board to find (?find=), which are read on their own, 200 at most", () => {
    expect(linkedFromSearch("?find=launch")).toBeNull()
    expect(findFromSearch("?find=launch%20budget")).toBe("launch budget")
    expect(findFromSearch("?find=%20%20")).toBeNull()
    expect(findFromSearch("?frame=f1")).toBeNull()
    expect(findFromSearch(`?find=${"x".repeat(201)}`)).toBeNull()
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
