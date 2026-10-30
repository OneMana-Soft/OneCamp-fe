import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"

vi.mock("@excalidraw/excalidraw", () => ({ convertToExcalidrawElements: (sk: Record<string, unknown>[]) => convertForTest(sk) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

import NotesBar, { FrameBar } from "./notesBar"
import { NOTE_COLOURS, noteSkeleton } from "@/lib/board/notes"
import { tidyNotes } from "@/lib/board/sticky"
import { isToastHotkey } from "@/components/ui/toast"
import { frameElement } from "./boardOps"
import { PHONE_DOCK } from "./phoneDock"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { TagHues } from "./tagHues"
import type { BoardVotes } from "./useBoardVoting"

// The bar beside a selection (design-22 1; miro-07): colour, size, tags,
// tidy, tasks and More, for notes; lay out and link, for a frame.

const note = (id: string, x = 0, y = 0, text = `Note ${id}`): TestElement[] => convertForTest([noteSkeleton({ id, x, y, text }) as never])

afterEach(() => {
  cleanup()
  mobile = false
  toast.mockReset()
  document.body.innerHTML = ""
})

// The board's tag colours (components/board/tagHues), as the workbench hands them over.
const picked: Record<string, string> = {}
const tagHues: TagHues = { hueOf: (tag) => hueFor(tag, picked[tag.toLowerCase()]), setHue: vi.fn((tag, hue) => void (picked[tag.toLowerCase()] = hue)) }

function mount(scene: ReturnType<typeof boardScene>, ids: string[], votes?: BoardVotes) {
  const page = document.createElement("div")
  page.setAttribute("data-board-page", "")
  document.body.appendChild(page)
  return render(<NotesBar api={scene.api} ids={ids} tagHues={tagHues} votes={votes} />, { container: page })
}

/** A round of dot voting as components/board/useBoardVoting hands it over: `mine` voted for, three each. */
const round = (mine: string[] = [], on = true): BoardVotes => ({
  voting: { id: "r1", perPerson: 3, byId: "sam", byName: "Sam" },
  votes: [["r1:sam", mine]],
  myVotes: mine,
  votesLeft: 3 - mine.length,
  canVote: on,
  vote: vi.fn(),
  startVoting: vi.fn(),
  endVoting: vi.fn(),
  clearVoting: vi.fn(),
})

describe("the notes bar", () => {
  it("names what's selected, and offers colour, sizes, tags, tidy, tasks and More", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    mount(s, ["a", "b"])
    expect(screen.getByRole("toolbar", { name: "2 notes" })).toBeTruthy()
    for (const name of ["Colour", "Small note", "Medium note", "Large note", "Tags", "Tidy up into a grid", "Cluster into frames", "Make 2 tasks", "More: stroke, fill and layers"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy()
    }
    expect(screen.getByRole("button", { name: "Medium note" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("leaves Alt+T to the app's notifications while notes are selected: the key reaches the page, untaken", () => {
    const s = boardScene([...note("a"), ...note("b", 400, 90)])
    mount(s, ["a", "b"])
    // The toasts listen on the document (components/ui/toast), after the bar's own listener on the window.
    const reached: boolean[] = []
    const toasts = (e: KeyboardEvent) => reached.push(isToastHotkey(e))
    document.addEventListener("keydown", toasts)
    try {
      fireEvent.keyDown(document.body, { key: "t", code: "KeyT", altKey: true })
      expect(reached).toEqual([true])
      expect(screen.queryByRole("textbox", { name: "Add a tag" })).toBeNull()
    } finally {
      document.removeEventListener("keydown", toasts)
    }
  })

  it("is on keys: Alt+G tidies, Alt+2 recolours, Alt+L and Alt+C open their pickers, Alt+K Make tasks, and the buttons say so", () => {
    const s = boardScene([...note("a"), ...note("b", 400, 90)])
    mount(s, ["a", "b"])
    expect(screen.getByRole("button", { name: "Tidy up into a grid" }).getAttribute("title")).toBe("Tidy up into a grid (Alt + G)")
    expect(screen.getByRole("button", { name: "Tags" }).getAttribute("aria-keyshortcuts")).toBe("Alt+L")
    const before = s.writes.length
    const want = tidyNotes(s.elements().filter((e) => e.id === "a" || e.id === "b") as never)
    fireEvent.keyDown(window, { key: "g", code: "KeyG", altKey: true })
    // One step: the notes where the bar's Tidy up puts them (lib/board/sticky tidyNotes).
    expect(s.writes.length).toBe(before + 1)
    expect({ x: s.byId("b")?.x, y: s.byId("b")?.y }).toEqual(want.get("b"))
    fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true })
    expect([s.byId("a")?.backgroundColor, s.byId("b")?.backgroundColor]).toEqual([NOTE_COLOURS.green.fill, NOTE_COLOURS.green.fill])
    fireEvent.keyDown(window, { key: "l", code: "KeyL", altKey: true })
    expect(screen.getByRole("textbox", { name: "Add a tag" })).toBeTruthy()
    // Typing in the picker's field is the field's: Alt+C there opens no colours.
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Add a tag" }), { key: "c", code: "KeyC", altKey: true })
    expect(screen.queryByRole("group", { name: "Colours" })).toBeNull()
    // Without Alt, a letter is the board's (Excalidraw's tools), never the bar's.
    const after = s.writes.length
    fireEvent.keyDown(window, { key: "g", code: "KeyG" })
    expect(s.writes.length).toBe(after)
    fireEvent.keyDown(window, { key: "k", code: "KeyK", altKey: true })
    expect(Array.from(screen.getByRole("dialog").querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Note a", "Note b"])
  })

  it("is on Alt+N for the next size, large, small and medium again, and the sizes say so (miro-07)", async () => {
    const s = boardScene(note("a"))
    mount(s, ["a"])
    const sizes = screen.getByRole("group", { name: "Size" })
    expect(sizes.getAttribute("title")).toBe("Size (Alt + N)")
    expect(sizes.getAttribute("aria-keyshortcuts")).toBe("Alt+N")
    expect(screen.getByRole("button", { name: "Small note" }).getAttribute("title")).toBe("Small note · Size (Alt + N)")
    for (const side of [240, 140, 180]) {
      await act(async () => {
        fireEvent.keyDown(window, { key: "n", code: "KeyN", altKey: true })
      })
      await vi.waitFor(() => expect(s.byId("a")?.width).toBe(side))
    }
  })

  it("votes for the selection while a round is on, from Vote or Alt+U, and says how many votes are left", () => {
    const s = boardScene([...note("a"), ...note("b", 400, 90)])
    const votes = round(["a"])
    mount(s, ["a", "b"], votes)
    const button = screen.getByRole("button", { name: "Vote" })
    expect(button.getAttribute("title")).toBe("Vote (Alt + U): 2 left")
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Alt+U")
    // No number on the button: a count of votes left fell as you voted and read as votes cast (DB-31 M1).
    expect(button.textContent).toBe("")
    // One of the two has the person's vote: not pressed, and a press votes for both (toggleVotes adds the missing one).
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(votes.vote).toHaveBeenLastCalledWith(["a", "b"])
    fireEvent.keyDown(window, { key: "u", code: "KeyU", altKey: true })
    expect(votes.vote).toHaveBeenCalledTimes(2)
  })

  it("shows Vote pressed when each selected note has the person's vote", () => {
    const s = boardScene([...note("a"), ...note("b", 400, 90)])
    mount(s, ["a", "b"], round(["a", "b"]))
    expect(screen.getByRole("button", { name: "Vote" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("has no Vote with no round on, and leaves Alt+U alone then", () => {
    const s = boardScene([...note("a"), ...note("b", 400, 90)])
    const votes = round([], false)
    mount(s, ["a", "b"], votes)
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull()
    const passed = fireEvent.keyDown(window, { key: "u", code: "KeyU", altKey: true })
    expect(passed).toBe(true)
    expect(votes.vote).not.toHaveBeenCalled()
  })

  it("recolours the selection from the swatches, in one step", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    mount(s, ["a"])
    fireEvent.click(screen.getByRole("button", { name: "Colour" }))
    fireEvent.click(screen.getByRole("button", { name: "Teal" }))
    expect(s.byId("a")?.backgroundColor).toBe(NOTE_COLOURS.teal.fill)
    expect(s.byId("b")?.backgroundColor).toBe(NOTE_COLOURS.yellow.fill)
    expect(s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
  })

  it("adds a tag from the field, and offers the board's tags to put on or take off", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    s.elements()[0].customData = { kind: "note", colour: "yellow", tags: ["risk"] }
    mount(s, ["b"])
    fireEvent.click(screen.getByRole("button", { name: "Tags" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Add a tag" }), { target: { value: "#launch" } })
    fireEvent.submit(screen.getByRole("textbox", { name: "Add a tag" }).closest("form")!)
    expect(s.byId("b")?.customData).toMatchObject({ tags: ["launch"] })
    fireEvent.click(screen.getByRole("button", { name: "risk" }))
    expect(s.byId("b")?.customData).toMatchObject({ tags: ["launch", "risk"] })
  })

  it("colours a tag for everyone from Tags, and shows each of the board's tags in its colour", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    s.elements()[0].customData = { kind: "note", colour: "yellow", tags: ["Risk"] }
    s.elements()[2].customData = { kind: "note", colour: "yellow", tags: ["ux"] }
    mount(s, ["a"])
    fireEvent.click(screen.getByRole("button", { name: "Tags" }))
    // Both of the board's tags wear their colour; only the selection's is offered to colour.
    for (const [name, tag] of [["Risk", "Risk"], ["ux", "ux"]]) {
      expect(screen.getByRole("button", { name }).querySelector("[data-chip-dot]")?.className, name).toContain(HUE_CLASS[hueFor(tag)])
    }
    const colours = screen.getByRole("radiogroup", { name: "Colour of Risk" })
    expect(screen.queryByRole("radiogroup", { name: "Colour of ux" })).toBeNull()
    expect(colours.querySelector('[aria-checked="true"]')?.getAttribute("aria-label")?.toLowerCase()).toBe(hueFor("Risk"))
    const other = hueFor("Risk") === "moss" ? "Berry" : "Moss"
    fireEvent.click(screen.getByRole("radio", { name: other }))
    expect(tagHues.setHue).toHaveBeenCalledWith("Risk", other.toLowerCase())
  })

  it("clusters the selection into a frame for each tag, named for it, and says so", () => {
    const s = boardScene([...note("a"), ...note("b", 300), ...note("c", 600)])
    s.elements()[0].customData = { kind: "note", colour: "yellow", tags: ["Risk"] }
    s.elements()[2].customData = { kind: "note", colour: "yellow", tags: ["risk", "ux"] }
    mount(s, ["a", "b", "c"])
    fireEvent.click(screen.getByRole("button", { name: "Cluster into frames" }))
    fireEvent.click(screen.getByRole("button", { name: /^By tag/ }))
    const frames = s.elements().filter((e) => e.type === "frame")
    expect(frames.map((f) => f.name)).toEqual(["Risk", "No tag"])
    expect(s.byId("a")?.frameId).toBe(frames[0].id)
    expect(s.byId("b")?.frameId).toBe(frames[0].id)
    expect(s.byId("c")?.frameId).toBe(frames[1].id)
    expect(s.writes).toHaveLength(1)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "3 notes in 2 frames" }))
  })

  it("clusters by colour, a frame for each colour", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    mount(s, ["a", "b"])
    fireEvent.click(screen.getByRole("button", { name: "Colour" }))
    fireEvent.click(screen.getByRole("button", { name: "Teal" }))
    fireEvent.click(screen.getByRole("button", { name: "Cluster into frames" }))
    fireEvent.click(screen.getByRole("button", { name: /^By colour/ }))
    expect(s.elements().filter((e) => e.type === "frame").map((f) => f.name)).toEqual([NOTE_COLOURS.teal.label])
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "2 notes in a frame" }))
  })

  it("sends notes without a tag to Tags when asked to cluster them by tag", () => {
    const s = boardScene([...note("a"), ...note("b", 300)])
    mount(s, ["a", "b"])
    fireEvent.click(screen.getByRole("button", { name: "Cluster into frames" }))
    expect(screen.getByRole("button", { name: /^By tag/ }).textContent).toContain("None of these has a tag yet")
    fireEvent.click(screen.getByRole("button", { name: /^By tag/ }))
    expect(screen.getByRole("textbox", { name: "Add a tag" })).toBeTruthy()
    expect(s.elements().some((e) => e.type === "frame")).toBe(false)
  })

  it("tidies a loose selection into an even grid", () => {
    const s = boardScene([...note("a", 0, 0), ...note("b", 230, 30), ...note("c", -20, 260)])
    mount(s, ["a", "b", "c"])
    fireEvent.click(screen.getByRole("button", { name: "Tidy up into a grid" }))
    expect(s.byId("b")).toMatchObject({ x: 184, y: 0 })
    expect(s.byId("c")).toMatchObject({ x: -20, y: 204 })
  })

  it("puts Excalidraw's own panel behind More while notes are selected", () => {
    const s = boardScene(note("a"))
    const view = mount(s, ["a"])
    const page = document.querySelector<HTMLElement>("[data-board-page]")!
    expect(page.dataset.notesSelected).toBe("true")
    expect(page.dataset.propsOpen).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: "More: stroke, fill and layers" }))
    expect(page.dataset.propsOpen).toBe("true")
    view.unmount()
    expect(page.dataset.notesSelected).toBeUndefined()
  })

  it("docks low on a phone, off Excalidraw's tool row and one bar above the facilitation bar", () => {
    mobile = true
    const s = boardScene(note("a"))
    mount(s, ["a"])
    const dock = document.querySelector("[data-notes-bar]")?.className.split(" ") ?? []
    expect(dock).toContain(PHONE_DOCK.selection)
    expect(dock).not.toContain(PHONE_DOCK.facilitation)
    // The dock carries the one mark the board's drag rule sends away, as the following bar does.
    expect(document.querySelector("[data-notes-bar]")?.hasAttribute("data-following-bar")).toBe(true)
  })

  it("leaves Make tasks off for notes that are already tasks", () => {
    const s = boardScene(note("a"))
    s.elements()[0].customData = { kind: "note", colour: "yellow", taskUuid: "t-1" }
    mount(s, ["a"])
    expect(screen.queryByRole("button", { name: /Make a task/ })).toBeNull()
  })
})

describe("the frame bar", () => {
  it("lays a frame's notes out in a grid, growing the frame to hold them", () => {
    const frame = frameElement({ id: "f", x: 0, y: 0, width: 500, height: 300, name: "Frame 1" }) as TestElement
    const notes = [...note("a", 300, 100), ...note("b", 20, 40), ...note("c", 100, 600)]
    for (const n of notes) n.frameId = "f"
    const s = boardScene([frame, ...notes])
    render(<FrameBar api={s.api} frameId="f" boardId="b1" />)
    fireEvent.click(screen.getByRole("button", { name: "Lay out in grid" }))
    expect(s.byId("b")).toMatchObject({ x: 40, y: 40 })
    expect(s.byId("a")).toMatchObject({ x: 244, y: 40 })
    expect(s.byId("c")).toMatchObject({ x: 40, y: 244 })
    expect(s.byId("f")!.height).toBe(40 + 180 * 2 + 24 + 40)
  })

  it("makes the frame's notes tasks, one left out when unticked, and words beside them aren't notes (a retro's actions)", () => {
    const frame = frameElement({ id: "f", x: 0, y: 0, width: 500, height: 300, name: "Actions" }) as TestElement
    const notes = [...note("a", 20, 40, "Book the venue"), ...note("b", 220, 40, "Who does what by when?")]
    const [words] = convertForTest([{ type: "text", id: "w", x: 20, y: 250, text: "Due Friday" }])
    for (const n of [...notes, words]) n.frameId = "f"
    const s = boardScene([frame, ...notes, words, ...note("outside", 900, 0, "Not in the frame")])
    render(<FrameBar api={s.api} frameId="f" boardId="b1" />)
    fireEvent.click(screen.getByRole("button", { name: "Make 2 tasks" }))
    const dialog = screen.getByRole("dialog")
    expect(Array.from(dialog.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Book the venue", "Who does what by when?"])
    fireEvent.click(screen.getByRole("checkbox", { name: "Who does what by when?" }))
    expect(screen.getByRole("button", { name: "Make a task" })).toBeTruthy()
  })

  it("offers no tasks for a frame whose notes are all tasks already", () => {
    const frame = frameElement({ id: "f", x: 0, y: 0, width: 500, height: 300, name: "Actions" }) as TestElement
    const notes = note("a", 20, 40, "Book the venue")
    notes[0].customData = { ...(notes[0].customData ?? {}), taskUuid: "t-1" }
    for (const n of notes) n.frameId = "f"
    render(<FrameBar api={boardScene([frame, ...notes]).api} frameId="f" boardId="b1" />)
    expect(screen.queryByRole("button", { name: /Make .*task/ })).toBeNull()
  })

  it("copies a link that opens the board at the frame", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const frame = frameElement({ id: "f", x: 0, y: 0, width: 500, height: 300, name: "Frame 1" }) as TestElement
    const s = boardScene([frame])
    render(<FrameBar api={s.api} frameId="f" boardId="b1" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy a link to this frame" })))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/app/board/b1?frame=f`)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Link copied" }))
  })
})

// Excalidraw moves, sizes and turns elements IN PLACE, frame by frame, and keeps its array until a move ends
// (boardScene's move): the bar beside a selection must still go with it. While a note moves by hand the bar steps
// aside (CSS on the board's own drag signal, [data-board-moving]) and holds its place; when the move ends it comes
// back above the note's new place, and any other change to the selection's box (an arrow key's nudge, an undo, a
// collaborator's move) re-places it at once (miro-06, DB-43).
describe("the bar beside a selection that moves", () => {
  const partsOf = (s: ReturnType<typeof boardScene>, id: string) => s.elements().filter((e) => e.id === id || e.containerId === id).map((e) => e.id)
  const placeOf = (sel: string) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(document.querySelector<HTMLElement>(sel)?.style.transform ?? "")
    return m ? { left: Number(m[1]), top: Number(m[2]) } : null
  }
  const DRAG = { selectedElementsAreBeingDragged: true }

  it("holds while a note is dragged, and comes back above its new place as the drag ends", () => {
    const s = boardScene(note("a", 300, 400), { selectedElementIds: { a: true } })
    mount(s, ["a"])
    const before = placeOf("[data-notes-bar]")!
    s.move(partsOf(s, "a"), 120, 60, DRAG)
    s.move(partsOf(s, "a"), 80, 40, DRAG)
    expect(placeOf("[data-notes-bar]")).toEqual(before)
    s.drop()
    expect(placeOf("[data-notes-bar]")).toEqual({ left: before.left + 200, top: before.top + 100 })
  })

  it("follows an arrow key's nudge at once, each step", () => {
    const s = boardScene(note("a", 300, 400), { selectedElementIds: { a: true } })
    mount(s, ["a"])
    const before = placeOf("[data-notes-bar]")!
    for (let i = 1; i <= 3; i++) {
      s.move(partsOf(s, "a"), 0, 5)
      expect(placeOf("[data-notes-bar]")).toEqual({ left: before.left, top: before.top + 5 * i })
    }
  })

  it("keeps its foot 8 px clear of Excalidraw's turn handle, which sits 18 to 26 px above the selection", () => {
    const wide = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320)
    const tall = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(34)
    try {
      const s = boardScene(note("a", 300, 400), { selectedElementIds: { a: true } })
      mount(s, ["a"])
      const at = placeOf("[data-notes-bar]")!
      expect(at.top + 34).toBeLessThanOrEqual(400 - 26 - 8)
      // Centred over the note, which is 180 wide.
      expect(at.left).toBe(300 + 90 - 160)
    } finally {
      wide.mockRestore()
      tall.mockRestore()
    }
  })

  it("is one rule for every bar beside a selection: a frame's bar goes with a dragged frame", () => {
    const frame = frameElement({ id: "f", x: 200, y: 300, width: 500, height: 300, name: "Frame 1" }) as TestElement
    const s = boardScene([frame], { selectedElementIds: { f: true } })
    render(<FrameBar api={s.api} frameId="f" boardId="b1" />)
    const before = placeOf("[data-frame-bar]")!
    s.move(["f"], 100, 50, DRAG)
    expect(placeOf("[data-frame-bar]")).toEqual(before)
    s.drop()
    expect(placeOf("[data-frame-bar]")).toEqual({ left: before.left + 100, top: before.top + 50 })
    // Both bars carry the one mark the board's drag rule hides.
    expect(document.querySelector("[data-frame-bar]")?.hasAttribute("data-following-bar")).toBe(true)
  })
})
