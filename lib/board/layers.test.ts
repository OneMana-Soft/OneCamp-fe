import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import * as Y from "yjs"
import { CAPTURE, guardOf, storeScene } from "./binding"
import {
  HOME_LAYER,
  LAYERS,
  MAX_LAYERS,
  ONLY_HOME,
  RESTACK_MS,
  addLayer,
  assignLayer,
  deleteLayer,
  hideLayer,
  layeredScene,
  lockLayer,
  markLocked,
  moveLayer,
  readLayers,
  renameLayer,
  restack,
  splitHidden,
  useLayeredScene,
  type LayerElement,
  type LayerSceneApi,
  type Layers,
} from "./layers"
import { lockedBackground } from "./templates"

// miro-03: layers kept in the board's document, the one filter that hides a layer, the stack in layer order, a layer's
// lock, a soft delete, and a template's background locked as it lands.

type El = LayerElement & { type: string; index?: string; locked?: boolean }
const el = (id: string, layer: string | null, index: string, more: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  index,
  customData: layer ? { layerId: layer } : undefined,
  ...more,
})
const two = (): { doc: Y.Doc; map: Y.Map<unknown>; top: string } => {
  const doc = new Y.Doc()
  const map = doc.getMap<unknown>(LAYERS)
  const r = addLayer(map, 1000)
  if (!("layer" in r)) throw new Error(r.refused)
  return { doc, map, top: r.layer.id }
}

describe("the layers record", () => {
  it("is Layer 1 alone on a board no one has layered (empty)", () => {
    const map = new Y.Doc().getMap<unknown>(LAYERS)
    expect(readLayers(map)).toEqual(ONLY_HOME)
    expect(readLayers(map)[0]).toMatchObject({ id: HOME_LAYER, name: "Layer 1", hidden: false, locked: false })
  })

  it("adds a layer on top, renames it, and says why a name is refused", () => {
    const { map, top } = two()
    expect(readLayers(map).map((l) => l.name)).toEqual(["Layer 1", "Layer 2"])
    expect(readLayers(map)[1].id).toBe(top)
    expect(renameLayer(map, top, "  Sketches  ")).toBeNull()
    expect(readLayers(map)[1].name).toBe("Sketches")
    expect(renameLayer(map, top, "   ")).toBe("A layer needs a name.")
    expect(renameLayer(map, top, "x".repeat(61))).toMatch(/60 characters/)
  })

  it("refuses a layer past the board's limit", () => {
    const map = new Y.Doc().getMap<unknown>(LAYERS)
    for (let i = 1; i < MAX_LAYERS; i++) addLayer(map, i)
    expect(readLayers(map)).toHaveLength(MAX_LAYERS)
    expect(addLayer(map)).toEqual({ refused: `A board holds up to ${MAX_LAYERS} layers.` })
  })

  it("hides and shows a layer, but never Layer 1, which holds new work", () => {
    const { map, top } = two()
    expect(hideLayer(map, top, true)).toBeNull()
    expect(readLayers(map)[1].hidden).toBe(true)
    expect(hideLayer(map, HOME_LAYER, true)).toBe("Layer 1 holds new work, so it always shows.")
    expect(readLayers(map)[0].hidden).toBe(false)
    expect(markLocked(map, top, true)).toBe("Show the layer to lock or unlock it.")
  })

  it("reorders the stack", () => {
    const { map, top } = two()
    expect(moveLayer(map, top, 0)).toBeNull()
    expect(readLayers(map).map((l) => l.id)).toEqual([top, HOME_LAYER])
  })

  it("deletes softly: the entry stays with deletedAt, its elements are Layer 1's, and Layer 1 is never deleted", () => {
    const { map, top } = two()
    expect(deleteLayer(map, HOME_LAYER)).toBe("Layer 1 holds new work, so it stays.")
    expect(deleteLayer(map, top, 5000)).toBeNull()
    expect(readLayers(map).map((l) => l.id)).toEqual([HOME_LAYER])
    expect(map.get(top)).toMatchObject({ deletedAt: 5000 })
    const live = readLayers(map)
    const kept = [el("a", top, "a0")]
    expect(splitHidden(kept, live).shown).toEqual(kept)
    expect(restack(kept, live)).toBeNull()
  })
})

describe("what a layer does to the drawing", () => {
  const layers = (hiddenTop = false): Layers => [
    { id: HOME_LAYER, name: "Layer 1", order: 0, hidden: false, locked: false, deletedAt: 0 },
    { id: "top", name: "Top", order: 1, hidden: hiddenTop, locked: false, deletedAt: 0 },
  ]

  it("moves a selection to a layer with its words and a frame's contents, taking the layer's lock, and skips a protected one", () => {
    const scene = [el("box", null, "a0"), el("words", null, "a1", { containerId: "box" }), el("frame", null, "a2", { type: "frame" }), el("in", null, "a3", { frameId: "frame" }), el("held", null, "a4")]
    const locked = { ...layers()[1], locked: true }
    const out = assignLayer(scene, ["box", "frame", "held"], locked, new Map([["held", {}]]))
    expect(out.map((e) => e.id)).toEqual(["box", "words", "frame", "in"])
    for (const e of out) expect(e).toMatchObject({ customData: { layerId: "top" }, locked: true, version: 2 })
  })

  it("stacks every higher layer's element over every lower one's, each layer's order kept, and is null when in order", () => {
    const scene = [el("t1", "top", "a0"), el("h1", null, "a1"), el("t2", "top", "a2"), el("h2", null, "a3")]
    expect(restack(scene, layers())!.map((e) => e.id)).toEqual(["h1", "h2", "t1", "t2"])
    expect(restack([scene[1], scene[3], scene[0], scene[2]], layers())).toBeNull()
    expect(restack([el("gone", "top", "a0", { isDeleted: true }), scene[1]], layers())).toBeNull()
    expect(restack(scene, ONLY_HOME)).toBeNull()
  })

  it("hides a layer's elements, a shape's words with it, and nothing else", () => {
    const scene = [el("t", "top", "a0"), el("words", null, "a1", { containerId: "t" }), el("h", null, "a2")]
    const { shown, hidden } = splitHidden(scene, layers(true))
    expect(shown.map((e) => e.id)).toEqual(["h"])
    expect(hidden.map((e) => e.id)).toEqual(["t", "words"])
    expect(splitHidden(scene, layers()).shown).toBe(scene)
  })

  it("locks and unlocks a layer's elements, never a protected one or another layer's", () => {
    const scene = [el("t", "top", "a0"), el("held", "top", "a1"), el("h", null, "a2")]
    const on = lockLayer(scene, "top", true, layers(), new Set(["held"]))
    expect(on.map((e) => [e.id, e.locked])).toEqual([["t", true]])
    expect(lockLayer([{ ...scene[0], locked: true }], "top", false, layers())[0].locked).toBe(false)
  })
})

describe("the scene a tab draws (the one filter boardExcalidraw draws through)", () => {
  const fakeApi = (initial: El[]) => {
    let scene: El[] = initial
    const api = {
      getSceneElementsIncludingDeleted: () => scene,
      updateScene: vi.fn((s: { elements?: readonly unknown[] }) => {
        if (s.elements) scene = s.elements as El[]
      }),
    }
    return { api, now: () => scene, set: (next: El[]) => void (scene = next) }
  }
  // A mind map: r, its child a, a's child a1 (a's fold hides a1).
  const node = (id: string, index: string, parent: string | null, folded = false): El =>
    el(id, null, index, { customData: { mindMap: { map: "m", parent, ...(folded ? { folded: true } : {}) } } })
  const map = () => [node("r", "a0", null), node("a", "a1", "r"), node("a1", "a2", "a")]
  const folding = (scene: El[], folded: boolean) => scene.map((e) => (e.id === "a" ? node("a", "a1", "r", folded) : e))
  const writes = (api: ReturnType<typeof fakeApi>["api"]) =>
    api.updateScene.mock.calls.map(([s]) => [(s as { captureUpdate?: string }).captureUpdate, (s.elements as El[]).map((e) => e.id).join(",")])

  it("leaves a hidden layer out of what is drawn, keeps it aside with its latest copy, and brings it back in its place", () => {
    const { map, top } = two()
    const { api, now } = fakeApi([el("h", null, "a0"), el("t", top, "a1"), el("h2", null, "a2")])
    const view = layeredScene(api as unknown as LayerSceneApi)
    view.show(readLayers(map))
    expect(now().map((e) => e.id)).toEqual(["h", "t", "h2"])
    hideLayer(map, top, true)
    view.show(readLayers(map))
    expect(now().map((e) => e.id)).toEqual(["h", "h2"])
    // A teammate's change to the hidden element arrives through the binding: drawn nowhere, kept as the newest.
    view.api.updateScene({ elements: [...now(), { ...el("t", top, "a1"), version: 5 }] } as never)
    expect(now().map((e) => e.id)).toEqual(["h", "h2"])
    hideLayer(map, top, false)
    view.show(readLayers(map))
    expect(now().map((e) => [e.id, e.version])).toEqual([["h", 1], ["t", 5], ["h2", 1]])
  })

  it("lands what a fold hides and an unfold brings back outside undo, after the caller's own step as it was handed", () => {
    // Excalidraw records an element that leaves the scene inside an undo step as removed: undoing the unfold, or
    // redoing the fold, would then delete the branch (e2e/boardMindMap.spec.ts). The fold is the person's step.
    const { api, now } = fakeApi(map())
    const view = layeredScene(api as unknown as LayerSceneApi)
    view.api.updateScene({ elements: folding(now(), true), captureUpdate: CAPTURE.IMMEDIATELY } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "r,a,a1"], ["NEVER", "r,a"]])
    api.updateScene.mockClear()
    view.api.updateScene({ elements: folding(now(), false), captureUpdate: CAPTURE.IMMEDIATELY } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "r,a"], ["NEVER", "r,a,a1"]])
    // A write that moves nothing, and the binding's own copies, stay one write.
    api.updateScene.mockClear()
    view.api.updateScene({ elements: now(), captureUpdate: CAPTURE.IMMEDIATELY } as never)
    view.api.updateScene({ elements: folding(now(), true), captureUpdate: CAPTURE.NEVER } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "r,a,a1"], ["NEVER", "r,a"]])
  })

  it("follows a fold that undo or redo changes inside Excalidraw once the drawing rests, outside undo", () => {
    vi.useFakeTimers()
    try {
      const { api, now, set } = fakeApi(map())
      const { result } = renderHook(() => useLayeredScene(new Y.Doc(), true))
      let view: LayerSceneApi = api as unknown as LayerSceneApi
      act(() => void (view = result.current.wrap(api as unknown as LayerSceneApi)))
      view.updateScene({ elements: folding(now(), true), captureUpdate: CAPTURE.IMMEDIATELY } as never)
      expect(now().map((e) => e.id)).toEqual(["r", "a"])
      // Undo unfolds a past the filter (Excalidraw's own history): its branch comes back once the drawing rests.
      set(folding(now(), false))
      api.updateScene.mockClear()
      act(() => result.current.changed(now()))
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([["NEVER", "r,a,a1"]])
      // Redo folds it again: the branch leaves, never deleted.
      set(folding(now(), true))
      api.updateScene.mockClear()
      act(() => result.current.changed(now()))
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([["NEVER", "r,a"]])
      expect(now().some((e) => e.isDeleted)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("lands a caller's write as it was handed, and what the filter hides or brings back after it outside undo", () => {
    // Excalidraw records an element that leaves the scene inside an undo step as removed: a square that undo brought
    // back onto a hidden layer, handed through a template's undoable insert, would be deleted when that insert is redone.
    const { map, top } = two()
    const { api, now } = fakeApi([el("h", null, "a0"), el("t", top, "a1"), el("w", null, "a1V", { containerId: "t" }), el("h2", null, "a2")])
    const view = layeredScene(api as unknown as LayerSceneApi)
    hideLayer(map, top, true)
    view.show(readLayers(map))
    expect(now().map((e) => e.id)).toEqual(["h", "h2"])
    api.updateScene.mockClear()
    view.api.updateScene({ elements: [...now(), el("t", top, "a1", { version: 2 }), el("n", null, "a3")], captureUpdate: CAPTURE.IMMEDIATELY } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "h,h2,t,n"], ["NEVER", "h,h2,n"]])
    // A teammate moves the box to Layer 1 inside someone's step: its words, set aside with it, come back after it.
    api.updateScene.mockClear()
    view.api.updateScene({ elements: [...now(), el("t", HOME_LAYER, "a1", { version: 3 })], captureUpdate: CAPTURE.IMMEDIATELY } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "h,h2,n,t"], ["NEVER", "h,t,w,h2,n"]])
    // A write that moves nothing, and the binding's own copies (NEVER), stay one write.
    api.updateScene.mockClear()
    view.api.updateScene({ elements: now(), captureUpdate: CAPTURE.IMMEDIATELY } as never)
    view.api.updateScene({ elements: [...now(), el("u", top, "a4")], captureUpdate: CAPTURE.NEVER } as never)
    expect(writes(api)).toEqual([["IMMEDIATELY", "h,t,w,h2,n"], ["NEVER", "h,t,w,h2,n"]])
    expect(now().some((e) => e.isDeleted)).toBe(false)
  })

  it("sets aside, outside undo, what undo or redo brings back onto a hidden layer once the drawing rests", () => {
    vi.useFakeTimers()
    try {
      const { doc, map, top } = two()
      hideLayer(map, top, true)
      const { api, now, set } = fakeApi([el("h", null, "a0"), el("t", top, "a1"), el("h2", null, "a2")])
      const gesture = { selectedElementsAreBeingDragged: false }
      const raw = Object.assign(api, { getAppState: () => gesture })
      const { result } = renderHook(() => useLayeredScene(doc, true))
      act(() => void result.current.wrap(raw as unknown as LayerSceneApi))
      expect(now().map((e) => e.id)).toEqual(["h", "h2"])
      // Undo restores t past the filter (Excalidraw's own history): it leaves again once the drawing rests, never deleted.
      set([now()[0], el("t", top, "a1", { version: 2 }), now()[1]])
      api.updateScene.mockClear()
      act(() => result.current.changed(now()))
      act(() => void vi.advanceTimersByTime(RESTACK_MS - 1))
      expect(writes(api)).toEqual([])
      act(() => void vi.advanceTimersByTime(1))
      expect(writes(api)).toEqual([["NEVER", "h,h2"]])
      // Brought back again while a drag is live: nothing is written until the drag ends and the drawing rests.
      set([now()[0], el("t", top, "a1", { version: 3 }), now()[1]])
      api.updateScene.mockClear()
      gesture.selectedElementsAreBeingDragged = true
      act(() => result.current.changed(now()))
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([])
      gesture.selectedElementsAreBeingDragged = false
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([["NEVER", "h,h2"]])
      // Shown again, it comes back as undo left it.
      hideLayer(map, top, false)
      expect(now().map((e) => [e.id, e.version, e.isDeleted ?? false])).toEqual([["h", 1, false], ["t", 3, false], ["h2", 1, false]])
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the words a person is typing, and their box, drawn while their layer is hidden, and sets them aside once the words end", () => {
    // CR-420 F2 and the m03 probe: Excalidraw keeps its editor open over a scene that lost the element, but each
    // keystroke's update and its submit miss it, so a teammate's hide dropped every word typed after it.
    vi.useFakeTimers()
    try {
      const { doc, map, top } = two()
      const words = el("w", null, "a1V", { type: "text", containerId: "t" })
      const memo = el("m", top, "a2", { type: "text" })
      const { api, now, set } = fakeApi([el("h", null, "a0"), el("t", top, "a1"), words, memo, el("x", top, "a3"), el("h2", null, "a4")])
      const gesture: { editingTextElement: El | null } = { editingTextElement: words }
      const raw = Object.assign(api, { getAppState: () => gesture })
      const { result } = renderHook(() => useLayeredScene(doc, true))
      let scene: LayerSceneApi & { sceneGuard: { setAside(el: unknown): boolean } } = raw as never
      act(() => void (scene = result.current.wrap(raw as unknown as LayerSceneApi) as never))
      // Another tab hides the box's layer while its words are open here: the words and the box stay drawn, and the
      // words' writes store (nothing set aside); the rest of the layer leaves.
      act(() => void hideLayer(map, top, true))
      expect(now().map((e) => e.id)).toEqual(["h", "t", "w", "h2"])
      expect([scene.sceneGuard.setAside(words), scene.sceneGuard.setAside(el("t", top, "a1"))]).toEqual([false, false])
      // A keystroke, and a teammate's change arriving through the binding meanwhile: still drawn.
      set(now().map((e) => (e.id === "w" ? { ...e, version: 2 } : e)))
      act(() => void scene.updateScene({ elements: [...now(), { ...el("x", top, "a3"), version: 2 }], captureUpdate: CAPTURE.NEVER } as never))
      expect(now().map((e) => [e.id, e.version])).toEqual([["h", 1], ["t", 1], ["w", 2], ["h2", 1]])
      // While the words are open, the drawing's rest leaves them; once they end, the layer hides them, outside undo.
      api.updateScene.mockClear()
      act(() => result.current.changed(now()))
      act(() => void vi.advanceTimersByTime(RESTACK_MS * 3))
      expect(writes(api)).toEqual([])
      gesture.editingTextElement = null
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([["NEVER", "h,h2"]])
      // A text box of its own (no box) on the hidden layer, opened once the layer is shown: the same.
      act(() => void hideLayer(map, top, false))
      expect(now().map((e) => [e.id, e.version])).toEqual([["h", 1], ["t", 1], ["w", 2], ["m", 1], ["x", 2], ["h2", 1]])
      gesture.editingTextElement = memo
      act(() => void hideLayer(map, top, true))
      expect(now().map((e) => e.id)).toEqual(["h", "m", "h2"])
      api.updateScene.mockClear()
      act(() => result.current.changed(now()))
      gesture.editingTextElement = null
      act(() => void vi.advanceTimersByTime(RESTACK_MS))
      expect(writes(api)).toEqual([["NEVER", "h,h2"]])
      expect(now().some((e) => e.isDeleted)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("never writes a hidden element into the document, nor deletes it there", () => {
    const { map, top } = two()
    const shared = new Map<string, El>([["t", el("t", top, "a1")], ["h", el("h", null, "a0")]])
    const { api, now } = fakeApi([...shared.values()].map((e) => ({ ...e })))
    const view = layeredScene(api as unknown as LayerSceneApi)
    hideLayer(map, top, true)
    view.show(readLayers(map))
    expect(storeScene({ get: (id) => shared.get(id), set: (id, e) => shared.set(id, e as El) }, now(), guardOf(view.api))).toBe(0)
    expect(shared.get("t")!.isDeleted).toBeUndefined()
    expect(shared.get("t")!.version).toBe(1)
  })

  it("guards the store: only what the filter set aside is set aside, and restore puts the document's copy back aside, outside undo", () => {
    const { map, top } = two()
    const { api, now, set } = fakeApi([el("h", null, "a0"), el("t", top, "a1")])
    const view = layeredScene(api as unknown as LayerSceneApi)
    hideLayer(map, top, true)
    view.show(readLayers(map))
    expect(view.setAside(el("t", top, "a1"))).toBe(true)
    // On the hidden layer but never set aside (this tab's own new work, or an undo's restore, before the rest): the
    // person's own delete of it stores (MAIN condition 2).
    expect(view.setAside(el("n", top, "a2"))).toBe(false)
    expect(view.setAside(el("h", null, "a0"))).toBe(false)
    // Excalidraw's deleted copy, past the filter: the store refused it, and the document's live copy goes aside.
    set([...now(), el("n", top, "a2", { isDeleted: true, version: 3 })])
    view.restore([el("n", top, "a2", { version: 2 })])
    expect(now().map((e) => e.id)).toEqual(["h"])
    expect(writes(api).at(-1)).toEqual([CAPTURE.NEVER, "h"])
    hideLayer(map, top, false)
    view.show(readLayers(map))
    expect(now().find((e) => e.id === "n")).toMatchObject({ version: 2 })
    expect(now().find((e) => e.id === "n")?.isDeleted).toBeUndefined()
  })

  it("moves this tab's new work off a hidden layer at the rest, outside undo so no later Undo puts it back; never the document's copies or what it held", () => {
    const { map, top } = two()
    const { api, now, set } = fakeApi([el("h", null, "a0"), el("t", top, "a1")])
    const view = layeredScene(api as unknown as LayerSceneApi)
    hideLayer(map, top, true)
    view.show(readLayers(map))
    view.api.updateScene({ elements: [...now(), el("theirs", top, "a2")] as never, captureUpdate: CAPTURE.NEVER })
    // A paste or a library item saved from the hidden layer: Excalidraw puts it in the scene itself.
    set([...now(), el("pasted", top, "a3")])
    api.updateScene.mockClear()
    view.adopt()
    // NEVER: an EVENTUALLY move would ride the person's next step, and undoing that step would hide the copy again (CR-401 F2).
    expect(writes(api)).toEqual([[CAPTURE.NEVER, "h,pasted"]])
    expect(now().find((e) => e.id === "pasted")?.customData).toEqual({ layerId: "layer-1" })
    view.adopt()
    expect(writes(api)).toHaveLength(1)
  })
})

describe("a template's background", () => {
  it("lands locked: its frames, never its notes, words or arrows", () => {
    const out = lockedBackground<{ type: string; locked?: boolean }>([{ type: "frame" }, { type: "rectangle" }, { type: "text" }, { type: "arrow" }])
    expect(out.map((e) => e.locked === true)).toEqual([true, false, false, false])
  })
})
