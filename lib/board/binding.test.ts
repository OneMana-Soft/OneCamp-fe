import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import * as Y from "yjs"
import { CAPTURE, LOCAL_ORIGIN, applyShared, bumped, cloneElement, followShared, liveCount, mergeChanged, mergeShared, storeScene, type BoardElement } from "@/lib/board/binding"

type El = BoardElement & { x?: number; points?: number[][]; index?: string }
const el = (id: string, version: number, versionNonce = 1, more: Partial<El> = {}): El => ({ id, version, versionNonce, isDeleted: false, ...more })
/** An element with its fractional index (Excalidraw's stacking order). */
const at = (id: string, version: number, index: string, more: Partial<El> = {}): El => el(id, version, version, { index, ...more })
const ids = (els: readonly El[]) => els.map((e) => e.id)

describe("the board's binding", () => {
  it("takes a newer shared copy, and keeps a newer local one", () => {
    const { elements, adopted } = mergeShared([el("a", 2, 1, { x: 0 }), el("b", 5, 1, { x: 0 })], [el("a", 3, 7, { x: 40 }), el("b", 4, 7, { x: 40 })])
    expect(adopted).toBe(1)
    expect(elements.find((e) => e.id === "a")).toMatchObject({ version: 3, x: 40 })
    expect(elements.find((e) => e.id === "b")).toMatchObject({ version: 5, x: 0 })
  })

  it("gives a tie to the shared copy, as the document has already settled it", () => {
    const { elements, adopted } = mergeShared([el("a", 3, 1, { x: 0 })], [el("a", 3, 9, { x: 40 })])
    expect(adopted).toBe(1)
    expect(elements[0]).toMatchObject({ versionNonce: 9, x: 40 })
  })

  it("takes a deletion at the same version, which an older client may write", () => {
    const { elements, adopted } = mergeShared([el("a", 3, 1)], [el("a", 3, 1, { isDeleted: true })])
    expect(adopted).toBe(1)
    expect(elements[0].isDeleted).toBe(true)
  })

  it("adds what only the document has, and keeps what only the scene has", () => {
    const { elements, adopted } = mergeShared([el("mine", 1)], [el("theirs", 1)])
    expect(adopted).toBe(1)
    expect(elements.map((e) => e.id).sort()).toEqual(["mine", "theirs"])
  })

  it("leaves an element the scene already shows alone: nothing to put on the canvas", () => {
    const shown = el("a", 3, 5)
    const { elements, adopted } = mergeShared([shown], [el("a", 3, 5)])
    expect(adopted).toBe(0)
    expect(elements[0]).toBe(shown)
  })

  it("never hands the scene the object the document holds", () => {
    const shared = el("a", 2, 1, { points: [[0, 0]] })
    const { elements } = mergeShared([], [shared])
    expect(elements[0]).not.toBe(shared)
    ;(elements[0].points as number[][]).push([1, 1])
    expect(shared.points).toEqual([[0, 0]])
    const copy = cloneElement(shared)
    expect(copy).toEqual(shared)
    expect(copy).not.toBe(shared)
  })

  it("copies every level of an element, keeping what JSON has (null, a key left undefined, an empty list)", () => {
    const el = {
      id: "a", version: 1, points: [[0, 0], [5, 9]], boundElements: [{ id: "t", type: "text" }], groupIds: [] as string[],
      customData: { kind: "note", tags: ["q4"], votes: { ann: 2 } }, frameId: null, link: undefined, roundness: { type: 3 },
    }
    const copy = cloneElement(el)
    expect(copy).toStrictEqual(el)
    expect(Object.keys(copy)).toEqual(Object.keys(el))
    for (const k of ["points", "boundElements", "groupIds", "customData", "roundness"] as const) expect(copy[k]).not.toBe(el[k])
    expect(copy.points[1]).not.toBe(el.points[1])
    expect(copy.customData.tags).not.toBe(el.customData.tags)
    expect(copy.customData.votes).not.toBe(el.customData.votes)
  })

  it("puts the document's elements on the scene outside the person's undo history", () => {
    const updateScene = vi.fn()
    const api = { getSceneElementsIncludingDeleted: () => [el("a", 1)], updateScene }
    expect(applyShared(api, [el("a", 2), el("b", 1)])).toBe(2)
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(updateScene.mock.calls[0][0].captureUpdate).toBe("NEVER")
    expect(updateScene.mock.calls[0][0].elements.map((e: El) => e.id).sort()).toEqual(["a", "b"])
  })

  it("doesn't touch the scene when the document brings nothing new (an echo)", () => {
    const updateScene = vi.fn()
    const api = { getSceneElementsIncludingDeleted: () => [el("a", 2, 4)], updateScene }
    expect(applyShared(api, [el("a", 2, 4)])).toBe(0)
    expect(updateScene).not.toHaveBeenCalled()
  })

  it("counts what a person sees", () => {
    expect(liveCount([el("a", 1), el("b", 1, 1, { isDeleted: true }), el("c", 1)])).toBe(2)
  })

  it("stamps a change as a new version every screen takes", () => {
    const before = el("a", 4, 11, { x: 0 })
    const after = bumped(before, { x: 10 })
    expect(after).toMatchObject({ id: "a", version: 5, x: 10 })
    expect(typeof (after as { updated?: number }).updated).toBe("number")
    expect(before).toMatchObject({ version: 4, x: 0 })
    expect(mergeShared([before], [after]).adopted).toBe(1)
  })

  it("stacks the document's elements by their fractional index on the first load, whatever order the document lists them in", () => {
    // Yjs lists a map's keys in the order its writers' changes were applied,
    // not the stacking order; Excalidraw takes the array's order as the truth
    // and re-numbers what disagrees, bumping versions the next edit sends back.
    const { elements } = mergeShared([], [at("c", 1, "a2"), at("a", 1, "a0"), at("b", 1, "a1")])
    expect(ids(elements)).toEqual(["a", "b", "c"])
  })

  it("names Excalidraw's own capture values", () => {
    // Pinned to the library, since the binding can't import its value (it
    // would load the whole library on the board route).
    const store = readFileSync(join(process.cwd(), "node_modules/@excalidraw/excalidraw/dist/types/excalidraw/store.d.ts"), "utf8")
    for (const [k, v] of Object.entries(CAPTURE)) expect(store).toContain(`readonly ${k}: "${v}";`)
  })
})

// What a person changed goes to the document, from the member's canvas and a
// call's guest's alike: one writer, so both keep an erase and neither grows
// the document back.
describe("the scene written to the document", () => {
  const documentOf = (...els: El[]) => {
    const held = new Map<string, El>(els.map((e) => [e.id, e]))
    return { held, shared: { get: (id: string) => held.get(id), set: (id: string, e: El) => void held.set(id, e) } }
  }

  it("writes what is new, newer, or changed at the same version, each as a copy", () => {
    const { held, shared } = documentOf(el("older", 1), el("tied", 2, 1), el("same", 3, 3))
    const scene = [el("new", 1), el("older", 2), el("tied", 2, 9), el("same", 3, 3)]
    expect(storeScene(shared, scene)).toBe(3)
    expect([...held.keys()].sort()).toEqual(["new", "older", "same", "tied"])
    expect(held.get("older")).toMatchObject({ version: 2 })
    expect(held.get("tied")).toMatchObject({ versionNonce: 9 })
    expect(held.get("new")).not.toBe(scene[0])
  })

  it("keeps an erase and an undo of it, whatever the versions say", () => {
    const { held, shared } = documentOf(el("erased", 4), el("back", 4, 1, { isDeleted: true }))
    expect(storeScene(shared, [el("erased", 4, 1, { isDeleted: true }), el("back", 4)])).toBe(2)
    expect(held.get("erased")?.isDeleted).toBe(true)
    expect(held.get("back")?.isDeleted).toBe(false)
  })

  it("never writes back a deleted element the document doesn't have", () => {
    const { held, shared } = documentOf()
    expect(storeScene(shared, [el("pruned", 7, 1, { isDeleted: true })])).toBe(0)
    expect(held.size).toBe(0)
  })

  it("writes nothing when the document has the scene already (an echo)", () => {
    const { shared } = documentOf(el("a", 2, 4), el("b", 5, 1))
    expect(storeScene(shared, [el("a", 2, 4), el("b", 4, 1)])).toBe(0)
  })
})

describe("a teammate's change (W-4)", () => {
  it("merges only the elements it touched, and leaves the rest of the scene the same objects", () => {
    // Excalidraw keeps each element's drawing cached by object: an untouched
    // element must stay the very object it was.
    const scene = [at("a", 1, "a0"), at("b", 1, "a1"), at("c", 1, "a2")]
    const read = vi.fn((id: string) => (id === "b" ? at("b", 2, "a1", { x: 40 }) : undefined))
    const out = mergeChanged(scene, ["b"], read)
    expect(read).toHaveBeenCalledTimes(1)
    expect(out?.adopted).toBe(1)
    expect(out?.elements[0]).toBe(scene[0])
    expect(out?.elements[2]).toBe(scene[2])
    expect(out?.elements[1]).toMatchObject({ id: "b", version: 2, x: 40 })
    expect(scene[1]).toMatchObject({ version: 1 })
  })

  it("is nothing to put on the canvas when the scene shows it already, or the document no longer has it", () => {
    const scene = [at("a", 3, "a0")]
    expect(mergeChanged(scene, ["a"], () => at("a", 3, "a0"))).toBeNull()
    expect(mergeChanged(scene, ["a"], () => at("a", 2, "a0", { x: 9 }))).toBeNull()
    expect(mergeChanged(scene, ["gone"], () => undefined)).toBeNull()
  })

  it("puts a new element where its fractional index stacks it, not on top", () => {
    const out = mergeChanged([at("a", 1, "a0"), at("c", 1, "a2")], ["b"], () => at("b", 1, "a1"))
    expect(ids(out!.elements)).toEqual(["a", "b", "c"])
  })

  it("restacks an element a teammate sent backward or forward", () => {
    const scene = [at("a", 1, "a0"), at("b", 1, "a1"), at("c", 1, "a2")]
    expect(ids(mergeChanged(scene, ["c"], () => at("c", 2, "Zz"))!.elements)).toEqual(["c", "a", "b"])
    expect(ids(mergeChanged(scene, ["a"], () => at("a", 2, "a3"))!.elements)).toEqual(["b", "c", "a"])
  })

  it("keeps the scene's order where elements have no index (boards from before indices)", () => {
    const out = mergeChanged([el("b", 1), el("a", 1)], ["c"], () => el("c", 1))
    expect(ids(out!.elements)).toEqual(["b", "a", "c"])
  })

  it("never hands the scene the object the document holds", () => {
    const shared = at("a", 2, "a0", { points: [[0, 0]] })
    const out = mergeChanged([at("a", 1, "a0")], ["a"], () => shared)
    expect(out!.elements[0]).not.toBe(shared)
    expect(out!.elements[0]).toEqual(shared)
  })
})

describe("following the document (W-4)", () => {
  const setup = () => {
    const doc = new Y.Doc()
    const map = doc.getMap<El>("elements")
    doc.transact(() => {
      for (const [id, i] of [["a", "a0"], ["b", "a1"], ["c", "a2"]]) map.set(id, at(id, 1, i))
    })
    let scene: El[] = []
    const updateScene = vi.fn((d: { elements?: readonly unknown[] | null; captureUpdate?: unknown }) => {
      if (d.elements) scene = d.elements as El[]
    })
    const api = { getSceneElementsIncludingDeleted: () => scene, updateScene }
    const frames: (() => void)[] = []
    const frame = (cb: () => void) => frames.push(cb)
    const cancel = vi.fn()
    return { doc, map, api, updateScene, frames, frame, cancel, scene: () => scene }
  }

  it("draws the whole document at once, then a change as soon as it comes, reading only the keys it touched", () => {
    const { doc, map, api, updateScene, frame, cancel, scene } = setup()
    const merged = vi.fn()
    const follow = followShared(api, map, { frame, cancel, onMerged: merged })
    expect(ids(scene())).toEqual(["a", "b", "c"])
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(merged).toHaveBeenLastCalledWith(3)

    const get = vi.spyOn(map, "get")
    const values = vi.spyOn(map, "values")
    doc.transact(() => map.set("a", at("a", 2, "a0", { x: 1 })), "teammate")
    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(updateScene.mock.calls[1][0].captureUpdate).toBe("NEVER")
    expect(scene()[0]).toMatchObject({ id: "a", x: 1 })
    expect(get.mock.calls.map((c) => c[0])).toEqual(["a"])
    expect(values).not.toHaveBeenCalled()
    expect(merged).toHaveBeenLastCalledWith(1)
    follow.stop()
  })

  it("merges the rest of a frame's changes together on the next frame: a teammate's drag replaces the scene once a frame", () => {
    const { doc, map, api, updateScene, frames, frame, cancel, scene } = setup()
    const follow = followShared(api, map, { frame, cancel })
    // A drag: a change per pointer move. The first is drawn at once.
    doc.transact(() => map.set("a", at("a", 2, "a0", { x: 1 })), "teammate")
    const get = vi.spyOn(map, "get")
    doc.transact(() => map.set("a", at("a", 3, "a0", { x: 2 })), "teammate")
    doc.transact(() => map.set("b", at("b", 2, "a1", { x: 3 })), "teammate")
    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(frames).toHaveLength(1)
    frames.shift()!()
    expect(updateScene).toHaveBeenCalledTimes(3)
    expect(scene().map((e) => e.x ?? 0)).toEqual([2, 3, 0])
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"])
    // A frame with nothing new draws nothing, and the next change is drawn at once again.
    frames.shift()!()
    expect(frames).toHaveLength(0)
    doc.transact(() => map.set("c", at("c", 2, "a2", { x: 4 })), "teammate")
    expect(updateScene).toHaveBeenCalledTimes(4)
    follow.stop()
  })

  it("leaves this screen's own writes alone (LOCAL_ORIGIN)", () => {
    const { doc, map, api, updateScene, frames, frame, cancel } = setup()
    const follow = followShared(api, map, { frame, cancel })
    doc.transact(() => map.set("a", at("a", 2, "a0")), LOCAL_ORIGIN)
    expect(frames).toHaveLength(0)
    expect(updateScene).toHaveBeenCalledTimes(1)
    follow.stop()
  })

  it("stops following: the frame it booked is cancelled, and changes waiting for it go unread", () => {
    const { doc, map, api, updateScene, frames, frame, cancel } = setup()
    const follow = followShared(api, map, { frame, cancel })
    doc.transact(() => map.set("a", at("a", 2, "a0")), "teammate")
    doc.transact(() => map.set("b", at("b", 2, "a1")), "teammate")
    expect(updateScene).toHaveBeenCalledTimes(2)
    const get = vi.spyOn(map, "get")
    follow.stop()
    expect(cancel).toHaveBeenCalledTimes(1)
    doc.transact(() => map.set("c", at("c", 2, "a2")), "teammate")
    // Even a frame that runs anyway draws nothing.
    frames.shift()!()
    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(get).not.toHaveBeenCalled()
  })
})
