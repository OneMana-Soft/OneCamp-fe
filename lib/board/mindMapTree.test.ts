import { describe, expect, it, vi } from "vitest"
import { foldedAway, isFoldedNode, mindNodeOf, mindTag } from "./mindMapTree"
import { layeredScene, splitHidden, ONLY_HOME, type LayerElement, type LayerSceneApi } from "./layers"

// miro-15: a folded mind map node hides its branch through the board's one scene filter (splitHidden), so Find,
// export and the board's AI never read it; unfolding brings the branch back where it stood.

type El = LayerElement & { type: string; index?: string }
const node = (id: string, parent: string | null, index: string, folded = false): El => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  index,
  customData: { mindMap: { map: "m", parent, ...(folded ? { folded: true } : {}) } },
})
const words = (id: string, of: string, index: string): El => ({ id, type: "text", version: 1, versionNonce: 1, index, containerId: of })
const edge = (id: string, child: string, index: string): El => ({ id, type: "arrow", version: 1, versionNonce: 1, index, customData: { mindMap: { map: "m", child } } })

// root -> a -> (a1 -> a11), root -> b
const map = (foldA: boolean): El[] => [
  node("root", null, "a0"),
  node("a", "root", "a1", foldA),
  words("a-t", "a", "a2"),
  node("a1", "a", "a3"),
  words("a1-t", "a1", "a4"),
  edge("e-a1", "a1", "a5"),
  node("a11", "a1", "a6"),
  edge("e-a11", "a11", "a7"),
  node("b", "root", "a8"),
  edge("e-b", "b", "a9"),
]

// CR-421 F5: the one rule for the node the board is on, read by the bar's mount and by the keys at key time.
describe("mindNodeOf", () => {
  const els = [...map(false), { id: "note", type: "rectangle", version: 1, versionNonce: 1, index: "b0" } as El]
  const sel = (...ids: string[]) => ({ selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) })
  it("is the node whose words are open, else the one node selected; never a connector, two nodes or a plain shape", () => {
    expect(mindNodeOf(els, { ...sel("b"), editingTextElement: { containerId: "a1" } })).toBe("a1")
    expect(mindNodeOf(els, sel("a"))).toBe("a")
    expect(mindNodeOf(els, sel("e-a1"))).toBeNull()
    expect(mindNodeOf(els, sel("a", "b"))).toBeNull()
    expect(mindNodeOf(els, sel("note"))).toBeNull()
    expect(mindNodeOf(els, { ...sel("a"), editingTextElement: { containerId: "note" } })).toBeNull()
    expect(mindNodeOf(els, {})).toBeNull()
  })
})

describe("foldedAway", () => {
  it("hides a folded node's descendants, their words and their connectors, never the node itself", () => {
    expect([...foldedAway(map(true))].sort()).toEqual(["a1", "a1-t", "a11", "e-a1", "e-a11"])
    expect(foldedAway(map(false)).size).toBe(0)
  })

  it("hides a hidden connector's words with it, wherever they stand in the scene (CR-420 F1)", () => {
    const els = [words("e-a11-t", "e-a11", "a0V"), ...map(true)]
    expect([...foldedAway(els)].sort()).toEqual(["a1", "a1-t", "a11", "e-a1", "e-a11", "e-a11-t"])
  })

  it("hides a nested folded branch once, and reads tags only from mind map elements", () => {
    const els = map(true).map((e) => (e.id === "a1" ? node("a1", "a", "a3", true) : e))
    expect([...foldedAway(els)].sort()).toEqual(["a1", "a1-t", "a11", "e-a1", "e-a11"])
    expect(isFoldedNode(els[1])).toBe(true)
    expect(isFoldedNode(edge("x", "a", "b0"))).toBe(false)
    expect(mindTag({ customData: { mindMap: "nope" } })).toBeUndefined()
  })

  it("survives a parent cycle someone else wrote", () => {
    const loop = [node("x", "y", "a0", true), node("y", "x", "a1")]
    expect(() => foldedAway(loop)).not.toThrow()
  })
})

describe("splitHidden with a folded branch (the one filter)", () => {
  it("keeps a deleted folded node's branch out of the drawing, on every split and so after a reload (V-1207)", () => {
    // Excalidraw's own delete (its menu, select all) takes the folded node and its words, never the branch it hides.
    const gone = map(true).map((e) => (e.id === "a" || e.id === "a-t" ? { ...e, isDeleted: true } : e))
    expect([...foldedAway(gone)].sort()).toEqual(["a1", "a1-t", "a11", "e-a1", "e-a11"])
    const { shown, hidden } = splitHidden(gone, ONLY_HOME)
    expect(hidden.map((e) => e.id).sort()).toEqual(["a1", "a1-t", "a11", "e-a1", "e-a11"])
    expect(shown.some((e) => ["a1", "a1-t", "a11", "e-a1", "e-a11"].includes(e.id))).toBe(false)
  })

  it("leaves a folded branch out with no hidden layer", () => {
    const { shown, hidden } = splitHidden(map(true), ONLY_HOME)
    expect(shown.map((e) => e.id)).toEqual(["root", "a", "a-t", "b", "e-b"])
    expect(hidden).toHaveLength(5)
  })

  it("draws a fold at once, and an unfold brings the branch back in its stacking place", () => {
    let scene: El[] = map(false)
    const api = {
      getSceneElementsIncludingDeleted: () => scene,
      updateScene: vi.fn((s: { elements?: readonly unknown[] }) => {
        if (s.elements) scene = s.elements as El[]
      }),
    }
    const view = layeredScene(api as unknown as LayerSceneApi)
    view.show(ONLY_HOME)
    view.api.updateScene({ elements: map(true) } as never)
    expect(scene.map((e) => e.id)).toEqual(["root", "a", "a-t", "b", "e-b"])
    // This tab unfolds: its write carries only what it draws, and the branch set aside comes back.
    view.api.updateScene({ elements: scene.map((e) => (e.id === "a" ? { ...node("a", "root", "a1"), version: 2 } : e)) } as never)
    expect(scene.map((e) => e.id)).toEqual(map(false).map((e) => e.id))
  })
})
