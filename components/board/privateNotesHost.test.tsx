import { act, cleanup, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"
import type { BoardElement, SharedElements } from "@/lib/board/binding"
import { PRIVATE_KEY, emptyPrivateNotes, parsePrivateNotes, privateNotesKey } from "@/lib/board/privateNotes"
import PrivateNotesHost, { type PrivateNotesHandle } from "./privateNotesHost"

const h = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }), toast: h.toast }))

// Private mode's host (miro-25), the code the board's gate loads on demand: it hands the canvas its handle and says
// when it first has, puts the author's words back on a canvas that took the veiled copies while it came, and reveals
// a round that ended while the tab was away.

const SAM = { id: "u-sam", name: "Sam Rivera" }
const ROUND = { id: "r1", byId: SAM.id, byName: SAM.name, startedAt: 1 }
type El = BoardElement & Record<string, unknown>
const note = (id: string, extra: Record<string, unknown> = {}): El => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  customData: { kind: "note", colour: "yellow" },
  boundElements: [{ id: `${id}-t`, type: "text" }],
  ...extra,
})
const words = (id: string, containerId: string, text: string, extra: Record<string, unknown> = {}): El => ({
  id,
  type: "text",
  version: 1,
  versionNonce: 1,
  containerId,
  text,
  originalText: text,
  ...extra,
})

function board(scene: El[]) {
  const doc = new Y.Doc()
  const yElements = doc.getMap<El>("elements")
  const api = {
    scene,
    getSceneElementsIncludingDeleted: () => api.scene,
    getSceneElements: () => api.scene.filter((el) => !el.isDeleted),
    updateScene: vi.fn(({ elements }: { elements: El[] }) => {
      api.scene = elements
    }),
    getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 1280, height: 800, offsetLeft: 0, offsetTop: 0 }),
    onChange: () => () => {},
    onScrollChange: () => () => {},
  }
  return { doc, yElements, api }
}

function host(b: ReturnType<typeof board>, onReady = vi.fn(), ready = true) {
  const handleRef: { current: PrivateNotesHandle | null } = { current: null }
  const at = (ready: boolean) => (
    <PrivateNotesHost
      handleRef={handleRef}
      onReady={onReady}
      yDoc={b.doc}
      boardId="b1"
      who={SAM}
      api={b.api as never}
      yElements={b.yElements as unknown as SharedElements}
      yAuthors={new Map()}
      ready={ready}
    />
  )
  const view = render(at(ready))
  return { handleRef, onReady, view, ready: () => view.rerender(at(true)) }
}

const KEY = privateNotesKey("b1", SAM.id)
const kept = () => parsePrivateNotes(window.localStorage.getItem(KEY))
const VEIL = { locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } }
/** A held note as its author's tab keeps it (a card and its words) and as the board's document has it (veiled). */
function heldNote(id: string, text: string, version = 2) {
  const real = [note(id, { version }), words(`${id}-t`, id, text, { version })]
  const veiled = [note(id, { version: version + 1, locked: true, customData: { kind: "note", colour: "yellow", ...VEIL.customData } }), words(`${id}-t`, id, "", { version: version + 1, ...VEIL })]
  return { real, veiled }
}
function record(round: string, ...notes: El[][]) {
  const r = emptyPrivateNotes(round)
  for (const el of notes.flat()) {
    r.publicText[el.id] = ""
    r.real[el.id] = el
  }
  return r
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  h.toast.mockClear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("private mode's host", () => {
  it("hands the canvas its handle and says so once, so a write held while its code came goes out; gone, it takes it back", () => {
    const { handleRef, onReady, view } = host(board([]))
    expect(handleRef.current).not.toBeNull()
    expect(onReady).toHaveBeenCalledTimes(1)
    view.rerender(<></>)
    expect(handleRef.current).toBeNull()
  })

  it("veils from a round's first frame: the writer reads the round from the board, not from its last render", () => {
    const b = board([])
    const { handleRef } = host(b)
    expect(handleRef.current!.writer(b.yElements as never, [])).toBeUndefined()
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const scene = [note("c1"), words("c1-t", "c1", "Secret plan")]
    const write = handleRef.current!.writer(b.yElements as never, scene)!
    expect(write(scene[1])).toMatchObject({ text: "", locked: true, customData: { privateBy: SAM.id } })
  })

  it("puts the author's words back on a canvas that took the veiled copies while its code came, and writes nothing", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "", "c1-t": "" }
    notes.real["c1-t"] = words("c1-t", "c1", "Secret plan", { version: 2 })
    window.localStorage.setItem(privateNotesKey("b1", SAM.id), JSON.stringify(notes))
    const veiled = words("c1-t", "c1", "", { version: 3, locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } })
    const b = board([veiled])
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    host(b)
    expect(b.api.scene[0]).toMatchObject({ text: "Secret plan", version: 3 })
    expect(b.yElements.size).toBe(0)
  })

  it("reveals the notes of a round that ended while the tab was away: the board's document gets the words", () => {
    const notes = emptyPrivateNotes("r0")
    notes.publicText = { "c1-t": "" }
    notes.real["c1-t"] = words("c1-t", "c1", "Secret plan", { version: 2 })
    window.localStorage.setItem(privateNotesKey("b1", SAM.id), JSON.stringify(notes))
    const veiled = words("c1-t", "c1", "", { version: 3, locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } })
    const b = board([veiled])
    b.yElements.set(veiled.id, veiled)
    host(b)
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "Secret plan", version: 4 })
    expect(window.localStorage.getItem(privateNotesKey("b1", SAM.id))).toBeNull()
  })

  it("veils a teammate's held note with whose it is while the round runs, and the author's own from another tab or device as theirs; it says when each shows after", () => {
    const ann = { privateBy: "u-ann", privateName: "Ann Lee", kind: "note", colour: "yellow" }
    const hers = note("c2", { x: 40, y: 40, width: 180, height: 180, locked: true, customData: ann })
    const mine = note("c1", { x: 300, y: 40, width: 180, height: 180, locked: true, customData: { ...ann, privateBy: SAM.id, privateName: SAM.name } })
    const b = board([hers, mine])
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const { view } = host(b)
    expect(screen.getAllByRole("note").map((n) => n.getAttribute("aria-label"))).toEqual(["Private · Ann Lee", "Private · you, in another tab or device"])
    b.doc.getMap("facilitation").delete(PRIVATE_KEY)
    view.rerender(<></>)
    host(b)
    expect(screen.getAllByRole("note").map((n) => n.getAttribute("aria-label"))).toEqual(["Shows when Ann Lee opens the board", "Shows when your other tab or device opens the board"])
  })

  it("draws no veil on the author's own held note in the tab that keeps its words, its card's shared copy veiled or not", () => {
    // V-488: the tab's record holds the card's id and its words' real copy (a note edited in the round keeps no copy of
    // its card), so a card that came back veiled is still this tab's own, and its words are on it.
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "", "c1-t": "" }
    notes.real["c1-t"] = words("c1-t", "c1", "Secret plan", { version: 2 })
    window.localStorage.setItem(privateNotesKey("b1", SAM.id), JSON.stringify(notes))
    const card = note("c1", { x: 40, y: 40, width: 180, height: 180, locked: true, customData: { kind: "note", colour: "yellow", privateBy: SAM.id, privateName: SAM.name } })
    const veiled = words("c1-t", "c1", "", { version: 3, locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } })
    const b = board([card, veiled])
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const { handleRef } = host(b)
    expect(screen.queryAllByRole("note")).toHaveLength(0)
    expect(b.api.scene[1]).toMatchObject({ text: "Secret plan" })
    expect(handleRef.current!.holds("c1")).toBe(true)
    expect(handleRef.current!.holds("c2")).toBe(false)
  })

  it("keeps a record whose round's reveal hasn't run held into the next round, never sending it in the clear", () => {
    const notes = emptyPrivateNotes("r0")
    notes.publicText = { "c1-t": "Old words" }
    notes.real["c1-t"] = words("c1-t", "c1", "Secret plan")
    window.localStorage.setItem(privateNotesKey("b1", SAM.id), JSON.stringify(notes))
    const b = board([])
    const { handleRef } = host({ ...b, api: null as never })
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const scene = [words("c1-t", "c1", "Secret plan, edited", { version: 5 })]
    const write = handleRef.current!.writer(b.yElements as never, scene)!
    expect(write(scene[0])).toMatchObject({ text: "Old words", locked: true })
  })

  it("sends a note made in the round veiled from its outward view before the frame's write has taken it, and the rest as they are", () => {
    const b = board([])
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const { handleRef } = host(b)
    const scene = [note("c1"), words("c1-t", "c1", "Secret plan"), words("t2", "", "Agenda", { containerId: null })]
    const out = handleRef.current!.outward(scene)
    expect(out[1]).toMatchObject({ text: "", locked: true, customData: { privateBy: SAM.id } })
    expect(out[2]).toBe(scene[2])
    expect(JSON.stringify(out)).not.toContain("Secret plan")
  })

  it("tells the author once a round when this browser can't keep their held notes: they live in this tab till it ends", async () => {
    vi.useFakeTimers()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    const b = board([])
    b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const { handleRef } = host(b)
    const scene = [note("c1"), words("c1-t", "c1", "Secret plan")]
    const take = async () => {
      handleRef.current!.writer(b.yElements as never, scene)!(scene[1])
      await act(() => vi.advanceTimersByTimeAsync(500))
    }
    await take()
    expect(handleRef.current!.kept).toBe(false)
    expect(h.toast).toHaveBeenCalledTimes(1)
    // Work at risk, not done: the amber warning, never the success check (DESIGN-BUILD-108's F1).
    expect(h.toast.mock.calls[0][0]).toMatchObject({ title: "This browser can't keep your private notes", tone: "warning" })
    await take()
    expect(h.toast).toHaveBeenCalledTimes(1)
  })
  // V-497: the reveal reads the board's document, not the canvas. The host is the canvas's child, so its effects run
  // before the canvas puts the synced document on: a reveal that read the canvas found nothing and wiped the words.
  it("reveals a round that ended while the tab was shut though the canvas hasn't the board's document yet, and wipes no word unshown", () => {
    const x = heldNote("c1", "Secret plan")
    window.localStorage.setItem(KEY, JSON.stringify(record("r0", x.real)))
    const b = board([])
    for (const el of x.veiled) b.yElements.set(el.id, el)
    host(b)
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "Secret plan", originalText: "Secret plan", version: 4 })
    expect(b.yElements.get("c1-t")!.locked).toBeFalsy()
    expect(b.yElements.get("c1")!.customData).toEqual({ kind: "note", colour: "yellow" })
    expect(b.api.scene.map((el) => el.id)).toEqual(["c1", "c1-t"])
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it("reveals a held note the board's document never took (its tab shut before the write reached the server) from the copy the tab kept", () => {
    const x = heldNote("c1", "Secret plan")
    window.localStorage.setItem(KEY, JSON.stringify(record("r0", x.real)))
    const b = board([])
    host(b)
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "Secret plan", version: 3 })
    expect(b.yElements.get("c1")).toMatchObject({ version: 3 })
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it("writes nothing for a held note another tab or device of its author already showed, and lets its record go", () => {
    const x = heldNote("c1", "Secret plan")
    window.localStorage.setItem(KEY, JSON.stringify(record("r0", x.real)))
    const shown = [note("c1", { version: 5 }), words("c1-t", "c1", "Secret plan, final", { version: 5 })]
    const b = board(shown)
    for (const el of shown) b.yElements.set(el.id, el)
    host(b)
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "Secret plan, final", version: 5 })
    expect(b.api.updateScene).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it("keeps a running round's held notes held, whoever's tab kept them, when the round reaches this tab with the board's sync", () => {
    const x = heldNote("c1", "Secret plan")
    window.localStorage.setItem(KEY, JSON.stringify(record("r1", x.real)))
    const b = board([])
    const tab = host(b, vi.fn(), false)
    act(() => {
      b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
      for (const el of x.veiled) b.yElements.set(el.id, el)
      tab.ready()
    })
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "", locked: true })
    expect(b.api.updateScene).not.toHaveBeenCalled()
    expect(kept()?.real["c1-t"]).toMatchObject({ text: "Secret plan" })
  })

  it("never reveals a running round's notes when the round reaches the board's map after this tab drew and before its effects ran: the reveal reads the map, not the drawn round", () => {
    const x = heldNote("c1", "Secret plan")
    window.localStorage.setItem(KEY, JSON.stringify(record("r1", x.real)))
    const b = board([])
    // The board's sync lands between this tab's draw and its effects: the round it drew is none.
    function Sync() {
      React.useLayoutEffect(() => {
        b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
        for (const el of x.veiled) b.yElements.set(el.id, el)
      }, [])
      return null
    }
    render(
      <>
        <PrivateNotesHost handleRef={{ current: null }} onReady={vi.fn()} yDoc={b.doc} boardId="b1" who={SAM} api={b.api as never} yElements={b.yElements as unknown as SharedElements} yAuthors={new Map()} ready />
        <Sync />
      </>,
    )
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "", locked: true })
    expect(b.api.updateScene).not.toHaveBeenCalled()
    expect(kept()?.real["c1-t"]).toMatchObject({ text: "Secret plan" })
  })

  it("reveals this tab's notes from an ended round and keeps the record another tab saved for the running round", () => {
    const x = heldNote("c1", "Last round's words")
    const y = heldNote("c2", "This round's words")
    window.localStorage.setItem(KEY, JSON.stringify(record("r0", x.real)))
    const b = board([])
    const tab = host(b, vi.fn(), false)
    act(() => {
      // Another tab of the member's saved its notes from the running round over this tab's ended one.
      window.localStorage.setItem(KEY, JSON.stringify(record("r1", y.real)))
      b.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
      for (const el of [...x.veiled, ...y.veiled]) b.yElements.set(el.id, el)
      tab.ready()
    })
    expect(b.yElements.get("c1-t")).toMatchObject({ text: "Last round's words" })
    expect(b.yElements.get("c2-t")).toMatchObject({ text: "", locked: true })
    expect(kept()).toMatchObject({ round: "r1", real: { "c2-t": { text: "This round's words" } } })
    expect(Object.keys(kept()!.publicText).sort()).toEqual(["c2", "c2-t"])
  })

  // V-494: one member's tabs in one browser share one record. Each keeps its own in memory, so a save of one whole
  // record dropped the other tab's notes, and a reveal's wipe took them too.
  it("keeps one record for a member's two tabs: neither tab's save drops the other's held notes", () => {
    vi.useFakeTimers()
    const [a, b] = [board([]), board([])]
    for (const t of [a, b]) t.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const [tabA, tabB] = [host(a), host(b)]
    const fromA = [note("x1"), words("x1-t", "x1", "Tab A's words")]
    const fromB = [note("y1"), words("y1-t", "y1", "Tab B's words")]
    fromA.forEach(tabA.handleRef.current!.writer(a.yElements as never, fromA)!)
    act(() => vi.advanceTimersByTime(500))
    fromB.forEach(tabB.handleRef.current!.writer(b.yElements as never, fromB)!)
    act(() => vi.advanceTimersByTime(500))
    expect(Object.keys(kept()!.publicText).sort()).toEqual(["x1", "x1-t", "y1", "y1-t"])
    expect(kept()!.real["x1-t"]).toMatchObject({ text: "Tab A's words" })
    expect(kept()!.real["y1-t"]).toMatchObject({ text: "Tab B's words" })
  })

  it("shows at the round's end the held notes a member's other tab kept and shut on, and wipes none it didn't show", () => {
    vi.useFakeTimers()
    const [a, b] = [board([]), board([])]
    for (const t of [a, b]) t.doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    const tabB = host(b)
    const tabA = host(a)
    const fromA = [note("x1"), words("x1-t", "x1", "Tab A's words")]
    const veiled = fromA.map(tabA.handleRef.current!.writer(a.yElements as never, fromA)!)
    act(() => vi.advanceTimersByTime(500))
    tabA.view.unmount()
    // The server takes tab A's veiled copies to tab B; then the round ends.
    for (const el of veiled) b.yElements.set(el.id, el as El)
    act(() => {
      b.doc.getMap("facilitation").delete(PRIVATE_KEY)
    })
    expect(b.yElements.get("x1-t")).toMatchObject({ text: "Tab A's words" })
    expect(b.yElements.get("x1-t")!.locked).toBeFalsy()
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(tabB.handleRef.current!.round).toBeNull()
  })
})
