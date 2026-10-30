import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import * as Y from "yjs"
import { boardScene, convertForTest } from "@/lib/testing/boardScene"

const xl = vi.hoisted(() => ({ exportToSvg: vi.fn(), serializeAsJSON: vi.fn(), loadFromBlob: vi.fn() }))
vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (sk: Record<string, unknown>[]) => convertForTest(sk),
  exportToSvg: (...a: unknown[]) => xl.exportToSvg(...a),
  serializeAsJSON: (...a: unknown[]) => xl.serializeAsJSON(...a),
  loadFromBlob: (...a: unknown[]) => xl.loadFromBlob(...a),
}))
const saved = vi.hoisted(() => ({ downloadFile: vi.fn(), printTitled: vi.fn() }))
vi.mock("@/lib/export/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/download")>()),
  downloadFile: (...a: unknown[]) => saved.downloadFile(...a),
}))
vi.mock("@/lib/export/print", () => ({ printTitled: (...a: unknown[]) => saved.printTitled(...a) }))
// The workspace's own board templates, as the list answers them (none unless a test says).
let teamList: unknown[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetch: (key: string) => ({ data: key.endsWith("?kind=board") ? { data: teamList } : undefined, isLoading: false }) }))
const getTemplate = vi.fn()
const publishTemplate = vi.fn()
vi.mock("@/services/marketplaceService", () => ({
  boardTemplatesKey: "/marketplace/templates?kind=board",
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  publishTemplate: (...a: unknown[]) => publishTemplate(...a),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
const seen = vi.fn()
vi.mock("@/lib/board/notes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/board/notes")>()
  return {
    ...real,
    isStickyNote: (...a: Parameters<typeof real.isStickyNote>) => {
      seen()
      return real.isStickyNote(...a)
    },
  }
})

import BoardWorkbench, { useBoardSelection, useTypedNoteFit } from "./boardWorkbench"
import { useBoardStyle } from "./boardStyle"
import { noteSkeleton } from "@/lib/board/notes"

// The board's tools in one lazy chunk (whiteboard W-1): it reads the scene's
// selection once a change, answers the page's presses, and lays a template
// asked for by the address.

const provider = () => ({ document: new Y.Doc() }) as never as import("@hocuspocus/provider").HocuspocusProvider

afterEach(() => {
  cleanup()
  seen.mockReset()
  getTemplate.mockReset()
  publishTemplate.mockReset()
  toast.mockReset()
  teamList = []
  mobile = false
  window.history.replaceState(null, "", "/")
})

/** A team's template as one template's read answers it: a frame holding a note and its words. */
const savedRetro = {
  id: "t-1",
  kind: "board",
  name: "Sprint retro",
  payload: JSON.stringify({
    title: "Sprint retro",
    elements: [
      { id: "f", type: "frame", x: 0, y: 0, width: 400, height: 300, name: "Went well", version: 9 },
      { id: "n", type: "rectangle", x: 20, y: 40, width: 180, height: 180, frameId: "f", boundElements: [{ id: "w", type: "text" }], customData: { kind: "note", colour: "teal" }, version: 9 },
      { id: "w", type: "text", x: 40, y: 110, width: 140, height: 25, text: "Shipped", containerId: "n", frameId: "f", version: 9 },
    ],
  }),
}

describe("the board's selection", () => {
  it("is read once a change: a pan's frames, with the same shapes and selection, are skipped", () => {
    const s = boardScene(convertForTest([noteSkeleton({ id: "a", x: 0, y: 0 }) as never]))
    const { result } = renderHook(() => useBoardSelection(s.api))
    seen.mockReset()
    act(() => {
      for (let i = 0; i < 60; i++) s.pan()
    })
    expect(seen).toHaveBeenCalledTimes(0)
    act(() => s.select(["a"]))
    expect(result.current.notes).toEqual(["a"])
    expect(seen.mock.calls.length).toBeGreaterThan(0)
  })

  it("names one frame alone, and not a frame among other things", () => {
    const s = boardScene([{ id: "f", type: "frame", x: 0, y: 0, width: 10, height: 10, version: 1 }, { id: "r", type: "ellipse", x: 0, y: 0, width: 10, height: 10, version: 1 }])
    const { result } = renderHook(() => useBoardSelection(s.api))
    act(() => s.select(["f"]))
    expect(result.current.frame).toBe("f")
    act(() => s.select(["f", "r"]))
    expect(result.current.frame).toBeNull()
  })

  it("names every selected element in the scene's order, and keeps the same selection when only the array is new", () => {
    const s = boardScene([{ id: "f", type: "frame", x: 0, y: 0, width: 10, height: 10, version: 1 }, { id: "r", type: "ellipse", x: 0, y: 0, width: 10, height: 10, version: 1 }])
    const { result } = renderHook(() => useBoardSelection(s.api))
    act(() => s.select(["r", "f"]))
    expect(result.current.ids).toEqual(["f", "r"])
    const before = result.current
    // A move ends: Excalidraw hands over a new array with the same elements and selection.
    s.drop()
    expect(result.current).toBe(before)
  })
})

describe("the board's style", () => {
  it("is clean for a board that opens empty, hand-drawn for one with a drawing, and kept once chosen", () => {
    const empty = provider()
    const { result } = renderHook(() => useBoardStyle(empty, true))
    expect(result.current[0]).toBe("clean")
    act(() => result.current[1]("sketch"))
    expect(result.current[0]).toBe("sketch")
    expect(empty.document.getMap("boardMeta").get("style")).toBe("sketch")
    const drawn = provider()
    drawn.document.getMap("elements").set("x", { id: "x" })
    expect(renderHook(() => useBoardStyle(drawn, true)).result.current[0]).toBe("sketch")
  })
})

describe("the workbench", () => {
  it("gives new shapes the board's style", () => {
    const s = boardScene()
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    expect(s.writes.some((w) => w.appState?.currentItemRoughness === 0 && w.appState?.currentItemFontFamily === 6 && w.captureUpdate === "NEVER")).toBe(true)
  })

  it("opens the template picker and the Frames panel on the page's presses", async () => {
    const s = boardScene()
    const view = render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    view.rerender(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "templates", at: 1 }} style="clean" />)
    expect(await screen.findByRole("combobox", { name: "Find a template" })).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox", { name: "Find a template" }), { target: { value: "lean" } })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringMatching(/^Lean canvas/)])
    // The picker is a dialog: closed, the page behind it is reachable again.
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Find a template" }), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Find a template" })).toBeNull())
    view.rerender(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "frames", at: 2 }} style="clean" />)
    expect(await screen.findByRole("complementary", { name: "Frames" })).toBeTruthy()
    // Filter by tag takes the Frames panel's place: one panel there at a time, either way round.
    view.rerender(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "tagFilter", at: 3 }} style="clean" />)
    expect(await screen.findByRole("complementary", { name: "Filter by tag" })).toBeTruthy()
    expect(screen.queryByRole("complementary", { name: "Frames" })).toBeNull()
    view.rerender(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "frames", at: 4 }} style="clean" />)
    expect(await screen.findByRole("complementary", { name: "Frames" })).toBeTruthy()
    expect(screen.queryByRole("complementary", { name: "Filter by tag" })).toBeNull()
  })

  it("shows everyone a note's tags in the board's colours, and gives only an editor the bar to tag, colour or cluster them (miro-07 5)", () => {
    const els = convertForTest([noteSkeleton({ id: "n", x: 40, y: 40, text: "Ship it" }) as never])
    els[0].customData = { kind: "note", colour: "yellow", tags: ["Risk"] }
    const s = boardScene(els, { selectedElementIds: { n: true } })
    // The colour Risk was given on this board, kept with it for everyone.
    const shared = provider()
    shared.document.getMap("boardMeta").set("tagHue:risk", "berry")
    const view = render(<BoardWorkbench api={s.api} provider={shared} boardId="b1" editable={false} synced quiet={false} command={null} style="clean" />)
    expect(document.querySelector('[data-note-tags-of="n"] [data-tag="Risk"]')?.getAttribute("data-hue")).toBe("berry")
    // A viewer (or a guest who can't draw): no notes bar, so nothing to tag, recolour or cluster with.
    expect(document.querySelector("[data-notes-bar]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Tags" })).toBeNull()
    view.rerender(<BoardWorkbench api={s.api} provider={shared} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    expect(screen.getByRole("button", { name: "Tags" })).toBeTruthy()
  })

  it("puts the board's map at the end of Excalidraw's zoom and undo cluster on a computer, and none on a phone (miro-04 3)", () => {
    const host = document.createElement("div")
    host.innerHTML = '<div class="layer-ui__wrapper__footer-left"><div class="Stack"><section></section></div></div>'
    document.body.append(host)
    const s = boardScene()
    const computer = render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" host={host} />)
    expect(host.querySelector("section")!.querySelector('[aria-label="Board map"]')).toBeTruthy()
    computer.unmount()
    // A phone's board is small enough to cross with a finger.
    mobile = true
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" host={host} />)
    expect(host.querySelector('[aria-label="Board map"]')).toBeNull()
    host.remove()
  })

  it("keeps Excalidraw's panel away while a note's words are typed, as it does while notes are selected (design-22 1)", () => {
    const s = boardScene(convertForTest([noteSkeleton({ id: "n", x: 0, y: 0, text: "Ship it" }) as never]))
    const page = document.createElement("div")
    page.setAttribute("data-board-page", "")
    document.body.appendChild(page)
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />, { container: page })
    expect(page.dataset.notesSelected).toBeUndefined()
    const words = s.elements().find((e) => e.type === "text" && e.containerId === "n")
    act(() => s.typing(words ?? null))
    expect(page.dataset.notesSelected).toBe("true")
    act(() => s.typing(null))
    expect(page.dataset.notesSelected).toBeUndefined()
    page.remove()
  })

  it("keeps a note its size while its words are typed, on the typing screen only (miro-07)", async () => {
    const long = "Write the launch plan, test the checkout, book the review. ".repeat(3).slice(0, 150)
    // The words typed past the note's side, as Excalidraw lays them out: still 18 px, the note grown to hold them.
    const typedPast = () => {
      const [rect, label] = convertForTest([noteSkeleton({ id: "n", x: 0, y: 0, text: "Ship it" }) as never])
      const grown = convertForTest([noteSkeleton({ id: "n", x: 0, y: 0, text: long }) as never])
      return [{ ...rect, height: grown[0].height }, { ...label, text: long, originalText: long }]
    }
    const s = boardScene(typedPast())
    renderHook(() => useTypedNoteFit(s.api, true))
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    act(() => s.typing(s.byId("n-text") ?? null))
    expect(s.byId("n")?.height).toBe(180)
    expect(s.byId("n-text")?.fontSize).toBe(15)
    expect(s.writes.map((w) => w.captureUpdate)).toEqual(["EVENTUALLY"])
    // A screen that can't edit the board never fits a note: the typing screen's fit comes to it with the words.
    const viewer = boardScene(typedPast())
    renderHook(() => useTypedNoteFit(viewer.api, false))
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    act(() => viewer.typing(viewer.byId("n-text") ?? null))
    expect(viewer.writes).toHaveLength(0)
  })

  it("opens at the element or group a link names (Excalidraw's own Copy link to object), and puts the address back", async () => {
    window.history.replaceState(null, "", "/app/board/b1?element=group-7")
    const [box] = convertForTest([{ type: "rectangle", id: "r1", x: 0, y: 0, width: 80, height: 40 }])
    const s = boardScene([{ ...box, groupIds: ["group-7"] }])
    const scroll = vi.spyOn(s.api, "scrollToContent")
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(scroll).toHaveBeenCalledWith("group-7", { fitToContent: true, animate: true }))
    expect(window.location.search).toBe("")
    expect(toast).not.toHaveBeenCalled()
  })

  it("says so when a link's object is no longer on the board, and leaves the view where it was", async () => {
    window.history.replaceState(null, "", "/app/board/b1?element=gone-1")
    const [box] = convertForTest([{ type: "rectangle", id: "gone-1", x: 0, y: 0, width: 80, height: 40 }])
    const s = boardScene([{ ...box, isDeleted: true }])
    const scroll = vi.spyOn(s.api, "scrollToContent")
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "That's no longer on the board", tone: "info" })), { timeout: 3000 })
    expect(scroll).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
  })

  // CR-71 MF1 (28 Oct): a first visit has no camera of its own, and the canvas
  // leaves the camera to a link; a link whose object is gone framed nothing.
  const goneWithDrawingAway = () => {
    window.history.replaceState(null, "", "/app/board/b1?element=gone-1")
    const [box, far] = convertForTest([
      { type: "rectangle", id: "gone-1", x: 0, y: 0, width: 80, height: 40 },
      { type: "rectangle", id: "far-1", x: 6000, y: 4000, width: 120, height: 80 },
    ])
    return boardScene([{ ...box, isDeleted: true }, far])
  }

  it("frames the drawing on a first visit through a link to an object since deleted, as a visit without the link would", async () => {
    localStorage.removeItem("onecamp:board:viewport:b1")
    const s = goneWithDrawingAway()
    const scroll = vi.spyOn(s.api, "scrollToContent")
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "That's no longer on the board" })), { timeout: 3000 })
    expect(scroll).toHaveBeenCalledWith([expect.objectContaining({ id: "far-1" })], expect.objectContaining({ fitToContent: true }))
  })

  it("stays where a return visit left the board when a link's object is gone", async () => {
    localStorage.setItem("onecamp:board:viewport:b1", JSON.stringify({ scrollX: 10, scrollY: 20, zoom: 1 }))
    try {
      const s = goneWithDrawingAway()
      const scroll = vi.spyOn(s.api, "scrollToContent")
      render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
      await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "That's no longer on the board" })), { timeout: 3000 })
      expect(scroll).not.toHaveBeenCalled()
    } finally {
      localStorage.removeItem("onecamp:board:viewport:b1")
    }
  })

  it("lays a template from the library when the address asks for one, on an empty board, once", async () => {
    window.history.replaceState(null, "", "/app/board/b1?template=lean-canvas")
    const s = boardScene()
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(s.elements().filter((e) => e.type === "frame").map((e) => e.name)).toEqual(expect.arrayContaining(["Problem", "Solution", "Revenue"])))
    expect(s.elements().find((e) => e.type === "text")?.fontFamily).toBe(6)
    expect(window.location.search).toBe("")
  })

  it("lays a team's template when the address asks for one: copies with new ids, every reference following, one undo step", async () => {
    window.history.replaceState(null, "", "/app/board/b1?template=team:t-1")
    getTemplate.mockResolvedValue(savedRetro)
    const s = boardScene()
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(s.elements().some((e) => e.type === "frame")).toBe(true))
    expect(getTemplate).toHaveBeenCalledWith("t-1")
    const els = s.elements()
    const frame = els.find((e) => e.type === "frame")!
    const note = els.find((e) => e.type === "rectangle")!
    const words = els.find((e) => e.type === "text")!
    expect([frame.id, note.id, words.id].every((id) => !["f", "n", "w"].includes(id))).toBe(true)
    expect(note.frameId).toBe(frame.id)
    expect(words.containerId).toBe(note.id)
    expect(note.boundElements).toEqual([{ id: words.id, type: "text" }])
    expect(s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
    expect(window.location.search).toBe("")
  })

  it("says so when a team's template can't be laid, and leaves the board as it was", async () => {
    window.history.replaceState(null, "", "/app/board/b1?template=team:gone")
    getTemplate.mockRejectedValue(new Error("404"))
    const s = boardScene()
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "The template couldn't be laid on the board" })))
    expect(s.elements()).toEqual([])
  })

  it("offers the workspace's own templates first in the picker, and lays one as copies", async () => {
    teamList = [{ ...savedRetro, payload: JSON.stringify({ title: "Sprint retro", count: 3, preview: [{ type: "frame", x: 0, y: 0, w: 400, h: 300 }] }), author_name: "Ann Lee" }]
    getTemplate.mockResolvedValue(savedRetro)
    const s = boardScene()
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "templates", at: 1 }} style="clean" />)
    await screen.findByRole("combobox", { name: "Find a template" })
    expect(screen.getByRole("button", { name: "Your team's" })).toBeTruthy()
    const first = screen.getAllByRole("option")[0]
    expect(first.textContent).toMatch(/^Sprint retro/)
    fireEvent.change(screen.getByRole("combobox", { name: "Find a template" }), { target: { value: "ann lee" } })
    fireEvent.click(screen.getByRole("option", { name: /Sprint retro/ }))
    await waitFor(() => expect(s.elements().filter((e) => e.type === "frame")).toHaveLength(1))
    expect(getTemplate).toHaveBeenCalledWith("t-1")
  })

  it("saves the board as a template on the page's press: what a person sees, without pictures or tasks", async () => {
    publishTemplate.mockResolvedValue({ id: "t-2" })
    const s = boardScene([
      { id: "n", type: "rectangle", x: 0, y: 0, width: 180, height: 180, version: 3, customData: { kind: "note", colour: "teal", taskUuid: "task-1" }, link: "/app/task/task-1" },
      { id: "p", type: "image", x: 0, y: 200, width: 100, height: 100, version: 1 },
      { id: "x", type: "ellipse", x: 0, y: 400, width: 10, height: 10, version: 2, isDeleted: true },
    ])
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={{ kind: "saveTemplate", at: 1 }} style="clean" title="Launch retro" />)
    expect(await screen.findByRole("textbox", { name: "Template name" })).toHaveProperty("value", "Launch retro")
    expect(screen.getByText(/1 thing from the board\. Pictures stay with the board\./)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved to Templates" })))
    expect(publishTemplate).toHaveBeenCalledTimes(1)
    const sent = publishTemplate.mock.calls[0][0]
    expect(sent).toMatchObject({ kind: "board", name: "Launch retro" })
    expect(sent.payload.title).toBe("Launch retro")
    expect(sent.payload.elements.map((e: { id: string }) => e.id)).toEqual(["n"])
    expect(sent.payload.elements[0].customData).toEqual({ kind: "note", colour: "teal" })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved to Templates" }))
  })

  it("draws a note's tags on every frame of a drag of its frame that brings it into view (miro-06)", () => {
    const els = convertForTest([noteSkeleton({ id: "n", x: 5000, y: 100, text: "Ship it" }) as never])
    els[0].customData = { kind: "note", colour: "yellow", tags: ["Risk"] }
    els[0].frameId = "f"
    const frame = { id: "f", type: "frame", x: 4900, y: 50, width: 400, height: 400, version: 1, frameId: null }
    const s = boardScene([frame, ...els], { selectedElementIds: { f: true } })
    render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    act(() => s.pan())
    expect(document.querySelector('[data-note-tags-of="n"]')).toBeNull()
    // The frame alone is selected: Excalidraw's drag moves its elements with it, in place.
    s.move(["f", ...els.map((e) => e.id)], -4800, 0, { selectedElementsAreBeingDragged: true })
    expect(document.querySelector<HTMLElement>('[data-note-tags-of="n"]')?.style.left).toBe("200px")
  })
})

describe("the board's exports and its file in (miro-36)", () => {
  const retro = () => [
    { id: "f1", type: "frame", x: 600, y: 0, width: 400, height: 300, name: "Went well", version: 1 },
    { id: "f2", type: "frame", x: 0, y: 0, width: 400, height: 300, name: "To improve", version: 1 },
    { id: "n", type: "rectangle", x: 20, y: 20, width: 180, height: 180, frameId: "f2", boundElements: [{ id: "w", type: "text" }], customData: { kind: "note", colour: "teal", tags: ["q4"] }, version: 1 },
    { id: "w", type: "text", x: 40, y: 90, width: 140, height: 25, text: "Ship it", originalText: "Ship it", containerId: "n", frameId: "f2", version: 1 },
  ]
  const ordered = () => {
    const doc = new Y.Doc()
    doc.getMap("boardMeta").set("frameOrder", ["f2", "f1"])
    doc.getMap("noteAuthors").set("n", { id: "u-sam", name: "Sam Rivera" })
    return { document: doc } as never as import("@hocuspocus/provider").HocuspocusProvider
  }

  it("saves the notes as CSV for a spreadsheet, named after the board", async () => {
    const s = boardScene(retro() as never)
    render(<BoardWorkbench api={s.api} provider={ordered()} boardId="b1" editable synced quiet={false} command={{ kind: "export", at: 1 }} style="clean" title="Launch retro" />)
    // The choice says what the file holds, its makers too.
    const choice = await screen.findByRole("radio", { name: /Notes as CSV/ })
    expect(choice.textContent).toContain("Words, who wrote them, colours, tags, frames, tasks and closed votes of 1 note")
    fireEvent.click(choice)
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saved.downloadFile).toHaveBeenCalledTimes(1))
    const [name, csv] = saved.downloadFile.mock.calls[0]
    expect(name).toBe("Launch retro.csv")
    expect(csv).toBe("Note,Author,Colour,Tags,Frame,Task\r\nShip it,Sam Rivera,Teal,q4,To improve,\r\n")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "1 note saved as Launch retro.csv" }))
    saved.downloadFile.mockReset()
  })

  it("prints each frame on a page, in the Frames panel's order, and takes the pages away after", async () => {
    xl.exportToSvg.mockImplementation(async () => document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    let pagesWhilePrinting = 0
    saved.printTitled.mockImplementation((_title: string, done?: () => void) => {
      pagesWhilePrinting = document.querySelectorAll("[data-board-print] section svg").length
      done?.()
    })
    const s = boardScene(retro() as never)
    render(<BoardWorkbench api={s.api} provider={ordered()} boardId="b1" editable synced quiet={false} command={{ kind: "export", at: 1 }} style="clean" title="Launch retro" />)
    expect(await screen.findByText(/Each frame on a page, in the Frames panel's order \(2 pages\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saved.printTitled).toHaveBeenCalledTimes(1))
    expect(xl.exportToSvg.mock.calls.map((c) => (c[0] as { exportingFrame?: { id: string } }).exportingFrame?.id)).toEqual(["f2", "f1"])
    expect(saved.printTitled).toHaveBeenCalledWith("Launch retro", expect.any(Function))
    expect(pagesWhilePrinting).toBe(2)
    expect(document.querySelector("[data-board-print]")).toBeNull()
    xl.exportToSvg.mockReset()
    saved.printTitled.mockReset()
  })

  it("keeps the printed pages until the dialog says it closed, and the next export takes away any left", async () => {
    // A browser whose print() returns before its dialog draws (iOS Safari) reads the pages later.
    xl.exportToSvg.mockImplementation(async () => document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    saved.printTitled.mockImplementation(() => {})
    const s = boardScene(retro() as never)
    const view = render(<BoardWorkbench api={s.api} provider={ordered()} boardId="b1" editable synced quiet={false} command={{ kind: "export", at: 1 }} style="clean" title="Launch retro" />)
    await screen.findByText(/Each frame on a page/)
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saved.printTitled).toHaveBeenCalledTimes(1))
    expect(document.querySelectorAll("[data-board-print]")).toHaveLength(1)
    view.rerender(<BoardWorkbench api={s.api} provider={ordered()} boardId="b1" editable synced quiet={false} command={{ kind: "export", at: 2 }} style="clean" title="Launch retro" />)
    await screen.findByText(/Each frame on a page/)
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saved.printTitled).toHaveBeenCalledTimes(2))
    expect(document.querySelectorAll("[data-board-print]")).toHaveLength(1)
    expect(document.querySelectorAll("style[data-board-print-style]")).toHaveLength(1)
    document.querySelectorAll("[data-board-print], style[data-board-print-style]").forEach((n) => n.remove())
    xl.exportToSvg.mockReset()
    saved.printTitled.mockReset()
  })

  it("lays an .excalidraw file's drawing on the board as copies, one undo step", async () => {
    xl.loadFromBlob.mockResolvedValue({
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60, version: 3 },
        { id: "b", type: "ellipse", x: 200, y: 0, width: 50, height: 50, version: 2 },
        { id: "gone", type: "ellipse", x: 0, y: 0, width: 5, height: 5, version: 2, isDeleted: true },
      ],
      files: {},
    })
    const s = boardScene([])
    const { container } = render(<BoardWorkbench api={s.api} provider={provider()} boardId="b1" editable synced quiet={false} command={null} style="clean" />)
    const input = container.querySelector("[data-board-open-file]") as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["{}"], "retro.excalidraw", { type: "application/json" })] } })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "2 things from retro.excalidraw laid on the board" })))
    const write = s.writes.find((w) => w.captureUpdate === "IMMEDIATELY")
    expect(write?.elements?.filter((e) => !e.isDeleted)).toHaveLength(2)
    expect(s.elements().some((e) => e.id === "a")).toBe(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "2 things from retro.excalidraw laid on the board" }))
    xl.loadFromBlob.mockReset()
  })
})
