import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { CAPTURE, applyShared, bumped, cloneElement, liveCount, mergeShared, type BoardElement } from "@/lib/board/binding"

type El = BoardElement & { x?: number; points?: number[][] }
const el = (id: string, version: number, versionNonce = 1, more: Partial<El> = {}): El => ({ id, version, versionNonce, isDeleted: false, ...more })

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

  it("names Excalidraw's own capture values", () => {
    // Pinned to the library, since the binding can't import its value (it
    // would load the whole library on the board route).
    const store = readFileSync(join(process.cwd(), "node_modules/@excalidraw/excalidraw/dist/types/excalidraw/store.d.ts"), "utf8")
    for (const [k, v] of Object.entries(CAPTURE)) expect(store).toContain(`readonly ${k}: "${v}";`)
  })
})
