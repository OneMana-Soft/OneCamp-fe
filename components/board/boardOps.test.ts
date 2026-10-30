import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { boardScene, convertForTest, convertInFace, type TestElement } from "@/lib/testing/boardScene"

vi.mock("@excalidraw/excalidraw", () => ({ convertToExcalidrawElements: (sk: Record<string, unknown>[]) => convertForTest(sk), FONT_FAMILY: { Excalifont: 5 } }))

import { addNotes, clusterIntoFrames, fitTypedNote, frameElement, loadConvert, moveElements, recolourNotes, resizeNotes, selectAndEdit, setFrame, tagNotes, viewMiddle } from "./boardOps"
import { NOTE_COLOURS, NOTE_SIZES, noteSkeleton } from "@/lib/board/notes"

// What the board's tools do to the scene (whiteboard W-1): each change is one
// undo step of the person's own, and everything it touches gets a new
// version, which is what every other screen merges on (lib/board/binding).

const note = (id: string, x = 0, y = 0, colour: keyof typeof NOTE_COLOURS = "yellow"): TestElement[] => convertForTest([noteSkeleton({ id, x, y, text: `Note ${id}`, colour }) as never])

afterEach(() => vi.useRealTimers())

describe("the board's tools on the scene", () => {
  it("add notes as one undo step, selected, laid out by Excalidraw's converter", async () => {
    const s = boardScene()
    const ids = await addNotes(s.api, [noteSkeleton({ id: "n1", x: 0, y: 0, text: "Ship it" }), noteSkeleton({ id: "n2", x: 200, y: 0 })])
    expect(ids).toEqual(["n1", "n2"])
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    expect(s.writes[0].appState?.selectedElementIds).toEqual({ n1: true, n2: true })
    expect(s.byId("n1-text")?.text).toBe("Ship it")
    const framed = boardScene()
    await addNotes(framed.api, [noteSkeleton({ id: "n3", x: 0, y: 0 })], { frameId: "f1" })
    expect(framed.byId("n3")?.frameId).toBe("f1")
    expect(framed.byId("n3-text")?.frameId).toBe("f1")
  })

  it("recolour notes, paper, edge and words, each a new version, in one step", () => {
    const s = boardScene([...note("a"), ...note("b", 300), ...note("c", 600)])
    expect(recolourNotes(s.api, new Set(["a", "b"]), "navy")).toBe(4)
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    expect(s.byId("a")).toMatchObject({ backgroundColor: NOTE_COLOURS.navy.fill, strokeColor: NOTE_COLOURS.navy.edge, version: 2, customData: { kind: "note", colour: "navy" } })
    expect(s.byId("a-text")).toMatchObject({ strokeColor: NOTE_COLOURS.navy.ink, version: 2 })
    expect(s.byId("c")).toMatchObject({ backgroundColor: NOTE_COLOURS.yellow.fill, version: 1 })
  })

  it("tag notes, and take the last tag off without leaving an empty list", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    tagNotes(s.api, (el) => (el.id === "a" ? ["risk"] : null))
    expect(s.byId("a")?.customData).toMatchObject({ tags: ["risk"] })
    expect(s.byId("b")?.customData).not.toHaveProperty("tags")
    tagNotes(s.api, (el) => (el.id === "a" ? [] : null))
    expect(s.byId("a")?.customData).not.toHaveProperty("tags")
  })

  it("move shapes with the words bound in them, and size a frame", () => {
    const frame = frameElement({ id: "f", x: -50, y: -50, width: 400, height: 300, name: "Frame 1" }) as TestElement
    const s = boardScene([frame, ...note("a")])
    moveElements(s.api, new Map([["a", { x: 100, y: 40 }]]), { sizes: new Map([["f", { width: 640, height: 360 }]]) })
    expect(s.byId("a")).toMatchObject({ x: 100, y: 40 })
    expect(s.byId("a-text")).toMatchObject({ x: 110, y: 50 })
    expect(s.byId("f")).toMatchObject({ width: 640, height: 360, x: -50 })
    expect(s.writes).toHaveLength(1)
  })

  it("cluster notes into new frames, one undo step: each frame named, each note and its words moved into theirs, the frames selected", () => {
    const old = frameElement({ id: "old", x: 0, y: 0, width: 900, height: 600, name: "Retro" }) as TestElement
    const s = boardScene([old, ...note("a"), ...note("b", 300), ...note("c", 600)])
    s.byId("a")!.frameId = "old"
    const ids = clusterIntoFrames(
      s.api,
      [
        { x: 1000, y: 0, width: 260, height: 260, name: "Risk" },
        { x: 1324, y: 0, width: 260, height: 260, name: "No tag" },
      ],
      new Map([
        ["a", { x: 1040, y: 40, frame: 0 }],
        ["b", { x: 1364, y: 40, frame: 1 }],
      ]),
    )
    expect(ids).toHaveLength(2)
    expect(ids.map((id) => s.byId(id))).toMatchObject([
      { type: "frame", name: "Risk", x: 1000, width: 260 },
      { type: "frame", name: "No tag", x: 1324 },
    ])
    expect(s.byId("a")).toMatchObject({ x: 1040, y: 40, frameId: ids[0] })
    expect(s.byId("a-text")).toMatchObject({ x: 1050, y: 50, frameId: ids[0] })
    expect(s.byId("b")).toMatchObject({ x: 1364, y: 40, frameId: ids[1] })
    // A note left out of the cluster stays where it was.
    expect(s.byId("c")).toMatchObject({ x: 600, y: 0 })
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    expect(s.writes[0].appState?.selectedElementIds).toEqual({ [ids[0]]: true, [ids[1]]: true })
  })

  it("make no frame when none of the notes is on the board any more", () => {
    const s = boardScene(note("a"))
    expect(clusterIntoFrames(s.api, [{ x: 0, y: 0, width: 260, height: 260, name: "Risk" }], new Map([["gone", { x: 40, y: 40, frame: 0 }]]))).toEqual([])
    expect(s.writes).toHaveLength(0)
  })

  it("put shapes in a frame with their words", () => {
    const s = boardScene(note("a"))
    setFrame(s.api, new Set(["a"]), "f")
    expect(s.byId("a")?.frameId).toBe("f")
    expect(s.byId("a-text")?.frameId).toBe("f")
  })

  it("resize notes about their middles, laying their words out again and keeping who they are", async () => {
    const base = note("a", 0, 0, "teal")
    base[0].customData = { ...(base[0].customData as object), tags: ["ux"], taskUuid: "t1" }
    base[0].boundElements = [...(base[0].boundElements as object[]), { type: "arrow", id: "arr" }]
    const s = boardScene(base)
    expect(await resizeNotes(s.api, new Set(["a"]), "l")).toBe(1)
    const a = s.byId("a")!
    const side = NOTE_SIZES.l
    expect(a).toMatchObject({ width: side, height: side, x: 90 - side / 2, y: 90 - side / 2, version: 2 })
    expect(a.customData).toMatchObject({ kind: "note", colour: "teal", tags: ["ux"], taskUuid: "t1" })
    expect((a.boundElements as { id: string }[]).map((b) => b.id)).toContain("arr")
    expect(s.byId("a-text")?.isDeleted).toBe(true)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
  })

  it("select a note and type in it, as Excalidraw does for Enter on a selected shape", () => {
    vi.useFakeTimers()
    const s = boardScene(note("a"))
    const container = document.createElement("div")
    const keys: string[] = []
    container.addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key))
    selectAndEdit(s.api, ["a"], container)
    expect(s.writes.at(-1)?.appState?.selectedElementIds).toEqual({ a: true })
    vi.advanceTimersByTime(50)
    expect(keys).toEqual(["Enter"])
  })

  it("find the middle of the view in the scene", () => {
    const s = boardScene([], { scrollX: -100, scrollY: 50, zoom: { value: 2 }, width: 800, height: 600 })
    expect(viewMiddle(s.api)).toEqual({ x: 300, y: 100 })
  })
})

// A note keeps its size while its words shrink to fit it (miro-07), down to the floor; past it the note grows.
// convertForTest's measure: a medium note holds 150 letters at 15 px, 300 letters grow it to 220 at 12, and 120
// letters fit a small note at 13 px, a medium one at 17 and a large one at 23.
describe("a note's words fit it", () => {
  const words = (n: number) => "Write the launch plan, test the checkout, book the review. ".repeat(6).slice(0, n)
  /** The note `id`, its words typed past its side as Excalidraw lays them out: still 18 px, the note grown to hold them. */
  const typedPast = (id: string, text: string) => {
    const [rect, label] = note(id)
    const grown = convertForTest([noteSkeleton({ id, x: 0, y: 0, text }) as never])
    return [{ ...rect, height: grown[0].height }, { ...label, text, originalText: text }]
  }

  it("lays a new note's words out at the largest size that keeps its side, and past the floor lets it grow", async () => {
    const s = boardScene()
    await addNotes(s.api, [noteSkeleton({ id: "short", x: 0, y: 0, text: "Ship it" }), noteSkeleton({ id: "long", x: 200, y: 0, text: words(150) }), noteSkeleton({ id: "longer", x: 400, y: 0, text: words(300) })])
    expect([s.byId("short")?.height, s.byId("short-text")?.fontSize]).toEqual([180, 18])
    expect([s.byId("long")?.height, s.byId("long-text")?.fontSize]).toEqual([180, 15])
    expect([s.byId("longer")?.height, s.byId("longer-text")?.fontSize]).toEqual([220, 12])
    expect(s.byId("long-text")?.originalText).toBe(words(150))
    expect(s.writes).toHaveLength(1)
  })

  it("fits a note's words to each new size", async () => {
    const s = boardScene(convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, text: words(120), size: "m" }) as never]))
    expect(s.byId("a-text")?.fontSize).toBe(18)
    for (const [size, side, font] of [["s", 140, 13], ["l", 240, 23], ["m", 180, 17]] as const) {
      await resizeNotes(s.api, new Set(["a"]), size)
      const label = s.elements().find((e) => e.type === "text" && e.containerId === "a" && !e.isDeleted)
      expect([s.byId("a")?.width, s.byId("a")?.height, label?.fontSize], size).toEqual([side, side, font])
    }
  })

  it("brings typed words down to fit, in the words' own element, as part of the typing's undo step", () => {
    const s = boardScene(typedPast("a", words(150)))
    expect(s.byId("a")?.height).toBe(235)
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(true)
    expect(s.byId("a")).toMatchObject({ height: 180, version: 2 })
    expect(s.byId("a-text")).toMatchObject({ fontSize: 15, originalText: words(150), isDeleted: false, version: 2 })
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("EVENTUALLY")
    // Fitted already: nothing more to write.
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(false)
    expect(s.writes).toHaveLength(1)
  })

  it("takes typed words back up as they shrink, and past the floor lets the note grow", () => {
    const s = boardScene(typedPast("a", words(150)))
    fitTypedNote(s.api, convertForTest as never, "a-text")
    // The words typed down to a few, as Excalidraw writes them: at the fitted size still.
    ;(s.api as { updateScene: (scene: unknown) => void }).updateScene({
      elements: s.elements().map((e) => (e.id === "a-text" ? { ...e, text: "Ship it", originalText: "Ship it", version: e.version + 1 } : e)),
    })
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(true)
    expect([s.byId("a")?.height, s.byId("a-text")?.fontSize]).toEqual([180, 18])
    const t = boardScene(typedPast("b", words(300)))
    fitTypedNote(t.api, convertForTest as never, "b-text")
    expect([t.byId("b")?.height, t.byId("b-text")?.fontSize]).toEqual([220, 12])
  })

  it("runs on Excalidraw 0.18.1, whose editor's floor the V-104 workaround in fitTypedNote is written for", () => {
    const { version } = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@excalidraw/excalidraw/package.json"), "utf8")) as { version: string }
    expect(version, "V-104: fitTypedNote's FLOOR_NUDGE works around 0.18.1's originalContainerCache; re-check it, and the V-104 leg, on an upgrade").toBe("0.18.1")
  })

  it("gives up fitting a note an editor keeps shrinking, once a few writes in a task, instead of looping (V-104)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const large = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, text: "Ship it", size: "l" }) as never])
    const s = boardScene(large, { editingTextElement: large.find((e) => e.id === "a-text") })
    // An editor that shrinks the note on every write, whatever its words' size, and the fit answering each change, as
    // useTypedNoteFit does: without a guard the two write each other until the stack runs out.
    const editor = s.api as unknown as { onChange: (cb: () => void) => () => void; updateScene: (scene: unknown) => void }
    let fits = 0
    editor.onChange(() => {
      const note = s.byId("a")
      if (!note || note.height === 40) return
      editor.updateScene({ elements: s.elements().map((e) => (e.id === "a" ? { ...e, height: 40, version: e.version + 1 } : e)) })
      fits++
      fitTypedNote(s.api, convertForTest as never, "a-text")
    })
    editor.updateScene({ elements: s.elements().map((e) => (e.id === "a" ? { ...e, height: 40, version: e.version + 1 } : e)) })
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(true)
    expect(fits, "the fit gave up").toBeLessThanOrEqual(10)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/V-104 guard/)
    warn.mockRestore()
    // The next task, the note may be fitted again.
    await new Promise((r) => setTimeout(r, 0))
    const later = boardScene(large.map((e) => (e.id === "a" ? { ...e, height: 40, version: e.version + 1 } : e)))
    expect(fitTypedNote(later.api, convertForTest as never, "a-text")).toBe(true)
  })

  it("raises a sized note its editor shrank with its words a hair off their size first, so the editor takes its height (V-104)", () => {
    const large = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, text: "Ship it", size: "l" }) as never])
    // Excalidraw's editor, opened again on the note, shrinks it to the floor it kept from before the size: its words and a margin.
    const shrunk = large.map((e) => (e.id === "a" ? { ...e, height: 40, version: e.version + 1 } : e))
    const s = boardScene(shrunk, { editingTextElement: large.find((e) => e.id === "a-text") })
    const font = s.byId("a-text")?.fontSize
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(true)
    expect(s.writes.map((w) => [w.elements?.find((e) => e.id === "a")?.height, w.elements?.find((e) => e.id === "a-text")?.fontSize, w.captureUpdate])).toEqual([
      [240, Number(font) + 0.01, "EVENTUALLY"],
      [240, font, "EVENTUALLY"],
    ])
    expect([s.byId("a")?.height, s.byId("a-text")?.fontSize]).toEqual([240, font])
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(false)
    // Its words not open: one write, as ever.
    const closed = boardScene(shrunk)
    expect(fitTypedNote(closed.api, convertForTest as never, "a-text")).toBe(true)
    expect(closed.writes).toHaveLength(1)
    expect([closed.byId("a")?.height, closed.byId("a-text")?.fontSize]).toEqual([240, font])
  })

  it("fits a note again when its words' face lands, as a correction no undo step of the person's carries", async () => {
    // The words' face is still on its way, so they're fitted in the fallback face (0.6 em a letter). The face's own
    // letters are wider (0.7 em): a frame after it lands, the note is fitted again in it.
    let landed = false
    let land = () => {}
    const comes = new Promise<void>((resolve) => (land = resolve))
    const fonts = { check: vi.fn(() => landed), load: vi.fn(() => comes.then(() => [])) }
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true })
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => (frame(0), 0))
    try {
      await loadConvert()
      const convert = ((sk: Record<string, unknown>[]) => convertInFace(landed ? 0.7 : 0.6)(sk)) as never
      const s = boardScene(typedPast("a", words(150)))
      expect(fitTypedNote(s.api, convert, "a-text")).toBe(true)
      expect([s.byId("a")?.height, s.byId("a-text")?.fontSize]).toEqual([180, 15])
      expect(fonts.load).toHaveBeenCalledTimes(1)
      landed = true
      land()
      await vi.waitFor(() => expect(s.writes).toHaveLength(2))
      expect([s.byId("a")?.height, s.byId("a-text")?.fontSize]).toEqual([180, 14])
      // The typing's fit joins the typing's own undo step. The face's is a layout correction that no step carries, as
      // Excalidraw writes a remote change: undoing the person's next step can't bring the fallback face's layout back.
      expect(s.writes.map((w) => w.captureUpdate)).toEqual(["EVENTUALLY", "NEVER"])
    } finally {
      Reflect.deleteProperty(document, "fonts")
      vi.unstubAllGlobals()
    }
  })

  it("gives words born in a note the note's ink before their first letter, and leaves words that have letters theirs (V-95)", () => {
    // Excalidraw makes a note's new words in its own current ink (#1e1e1e), whatever the note's colour.
    const [rect, label] = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, text: "", colour: "navy" }) as never])
    const s = boardScene([rect, { ...label, text: "", originalText: "", strokeColor: "#1e1e1e" }])
    expect(fitTypedNote(s.api, convertForTest as never, "a-text")).toBe(true)
    expect(s.byId("a-text")).toMatchObject({ strokeColor: NOTE_COLOURS.navy.ink, text: "", version: 2 })
    expect(s.writes.map((w) => w.captureUpdate)).toEqual(["EVENTUALLY"])
    // Words with letters keep the colour they have: a colour chosen for them is the person's.
    const chosen = boardScene([rect, { ...label, text: "Ship it", originalText: "Ship it", strokeColor: "#c92a2a" }])
    fitTypedNote(chosen.api, convertForTest as never, "a-text")
    expect(chosen.byId("a-text")?.strokeColor).toBe("#c92a2a")
  })

  it("keeps a note's words in their own colour through a size, as it keeps their face (V-95)", async () => {
    const [rect, label] = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, text: "Ship it", colour: "blue" }) as never])
    const s = boardScene([rect, { ...label, strokeColor: "#c92a2a" }])
    await resizeNotes(s.api, new Set(["a"]), "l")
    expect(s.elements().find((e) => e.type === "text" && e.containerId === "a" && !e.isDeleted)?.strokeColor).toBe("#c92a2a")
  })

  it("leaves a note sized by hand, and words in a shape that isn't a note, to Excalidraw", () => {
    const [rect, label] = typedPast("a", words(150))
    const byHand = boardScene([{ ...rect, width: 200 }, label])
    expect(fitTypedNote(byHand.api, convertForTest as never, "a-text")).toBe(false)
    const shape = boardScene([{ ...rect, customData: undefined, backgroundColor: "transparent" }, label])
    expect(fitTypedNote(shape.api, convertForTest as never, "a-text")).toBe(false)
    expect(byHand.writes.length + shape.writes.length).toBe(0)
  })
})
