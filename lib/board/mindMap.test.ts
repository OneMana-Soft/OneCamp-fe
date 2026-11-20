import { describe, expect, it } from "vitest"
import { branchOf, expandLabels, layoutMindMap, mapOf, mindKey, newSide, outlineHtml, relayout, type MindNode } from "./mindMap"

// miro-15: the ONE mind map layout (tree -> positions, left and right, no overlaps), the tree a scene holds, a
// branch in tree order, its doc outline, AI expand's children, and the keys a selected node takes.

const n = (id: string, parent: string | null, more: Partial<MindNode> = {}): MindNode => ({ id, parent, x: 0, y: 0, w: 160, h: 44, ...more })
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const tree = (): MindNode[] => [
  n("root", null, { x: 100, y: 200, w: 220, h: 64 }),
  n("r1", "root", { side: "r", y: 0 }),
  n("r2", "root", { side: "r", y: 10 }),
  n("l1", "root", { side: "l", y: 0 }),
  n("r1a", "r1", { y: 0 }),
  n("r1b", "r1", { y: 5, h: 90 }),
  n("r2a", "r2", { y: 0 }),
  n("l1a", "l1", { y: 0 }),
  n("l1b", "l1", { y: 1 }),
]

describe("layoutMindMap", () => {
  it("keeps the root where it stands, puts each side's branches beside it, and overlaps nothing", () => {
    const nodes = tree()
    const at = layoutMindMap(nodes)
    expect(at.get("root")).toMatchObject({ x: 100, y: 200 })
    const box = (id: string) => ({ ...at.get(id)!, w: nodes.find((x) => x.id === id)!.w, h: nodes.find((x) => x.id === id)!.h })
    expect(box("r1").x).toBeGreaterThan(100 + 220)
    expect(box("r1a").x).toBeGreaterThan(box("r1").x + 160)
    expect(box("l1").x + 160).toBeLessThan(100)
    expect(box("l1a").x + 160).toBeLessThan(box("l1").x)
    const ids = nodes.map((x) => x.id)
    for (const a of ids) for (const b of ids) if (a < b) expect(overlap(box(a), box(b)), `${a} / ${b}`).toBe(false)
    // Siblings keep their order top to bottom, and a parent sits at its children's middle.
    expect(box("r1").y).toBeLessThan(box("r2").y)
    expect(box("r1a").y).toBeLessThan(box("r1b").y)
    const mid = (id: string) => box(id).y + box(id).h / 2
    expect(Math.abs(mid("l1") - (box("l1a").y + box("l1b").y + 44) / 2)).toBeLessThan(1)
  })

  it("gives a folded node's branch no room and no place", () => {
    const open = layoutMindMap(tree())
    const folded = layoutMindMap(tree().map((x) => (x.id === "r1" ? { ...x, folded: true } : x)))
    expect(folded.has("r1a")).toBe(false)
    const gap = (at: typeof open) => at.get("r2")!.y - at.get("r1")!.y
    expect(gap(folded)).toBeLessThan(gap(open))
  })

  it("is the same for the same tree, and balances a new root branch onto the lighter side", () => {
    expect([...layoutMindMap(tree())]).toEqual([...layoutMindMap(tree())])
    expect(newSide(tree(), "root")).toBe("l")
    expect(newSide([n("root", null)], "root")).toBe("r")
  })
})

describe("a map in the scene", () => {
  const el = (id: string, parent: string | null, y: number, more: Record<string, unknown> = {}) => ({
    id, type: "rectangle", x: 0, y, width: 160, height: 44, version: 1, versionNonce: 1,
    customData: { mindMap: { map: "m", parent, ...more } }, boundElements: [{ id: `${id}-t`, type: "text" }],
  })
  const text = (id: string, words: string) => ({ id: `${id}-t`, type: "text", containerId: id, x: 4, y: 0, width: 100, height: 20, text: words, originalText: words, version: 1, versionNonce: 1 })
  const arrow = (child: string) => ({ id: `e-${child}`, type: "arrow", x: 0, y: 0, width: 0, height: 0, points: [[0, 0], [1, 1]], version: 1, versionNonce: 1, customData: { mindMap: { map: "m", child } } })
  const scene = () => [
    el("root", null, 0), text("root", "Launch"),
    el("a", "root", 0, { side: "r" }), text("a", "Site <beta> & docs"), arrow("a"),
    el("a1", "a", 0), text("a1", "Copy"), arrow("a1"),
    el("b", "root", 50, { side: "r" }), text("b", "Press"), arrow("b"),
    { ...el("gone", "root", 90), isDeleted: true },
  ]

  it("reads the tree, skipping deleted nodes, and lists a branch in tree order", () => {
    const nodes = mapOf(scene(), "m")
    expect(nodes.map((x) => x.id)).toEqual(["root", "a", "a1", "b"])
    expect(branchOf(nodes, "root")).toEqual(["root", "a", "a1", "b"])
    expect(branchOf(nodes, "a")).toEqual(["a", "a1"])
  })

  it("writes a branch as a doc outline of nested bullets, its words escaped", () => {
    const words = new Map(scene().filter((e) => e.type === "text").map((e) => [(e as { containerId: string }).containerId, (e as { text: string }).text]))
    expect(outlineHtml(mapOf(scene(), "m"), (id) => words.get(id) ?? "", "a")).toBe(
      "<ul><li><p>Site &lt;beta&gt; &amp; docs</p><ul><li><p>Copy</p></li></ul></li></ul>",
    )
  })

  it("lays a map out again: moves nodes with their words and re-draws each connector between its ends", () => {
    const out = relayout(scene() as never, "m")
    const byId = new Map(out.map((e) => [e.id, e as unknown as { x: number; y: number; points?: number[][] }]))
    expect(byId.get("a")!.x).toBeGreaterThan(160)
    expect(byId.get("a-t")!.x - byId.get("a")!.x).toBe(4)
    const edge = byId.get("e-a")!
    expect(edge.x).toBe(160)
    expect(edge.x + edge.points![1][0]).toBe(byId.get("a")!.x)
    const after = scene().map((x) => byId.get(x.id) ?? x)
    expect(relayout(after as never, "m")).toEqual([])
  })
})

describe("AI expand's children", () => {
  it("takes the centre's 3-6 neighbours' words, and refuses fewer", () => {
    const graph = (k: number) => ({
      nodes: [{ id: "c", label: "Centre" }, ...Array.from({ length: k }, (_, i) => ({ id: `n${i}`, label: ` Idea ${i} ` }))],
      edges: Array.from({ length: k }, (_, i) => ({ from: "c", to: `n${i}` })),
    })
    expect(expandLabels(graph(4))).toEqual(["Idea 0", "Idea 1", "Idea 2", "Idea 3"])
    expect(expandLabels(graph(9))).toHaveLength(6)
    expect(expandLabels(graph(2))).toBeNull()
  })

  it("takes the root's branches when one branch has more sub-topics than the root has branches (CR-421 F1)", () => {
    const words = ["Launch", "Site", "Press", "Ads", "Copy", "Pricing page", "Docs"]
    const ids = ["r", "a", "b", "c", "a1", "a2", "a3"]
    const graph = {
      nodes: ids.map((id, i) => ({ id, label: words[i] })),
      edges: [["r", "a"], ["r", "b"], ["r", "c"], ["a", "a1"], ["a", "a2"], ["a", "a3"]].map(([from, to]) => ({ from, to })),
    }
    expect(expandLabels(graph)).toEqual(["Site", "Press", "Ads"])
    // The answer listed with the root last: still the node nothing leads to.
    expect(expandLabels({ nodes: [...graph.nodes].reverse(), edges: graph.edges })).toEqual(["Ads", "Press", "Site"])
    // Never the expanded node's own words as its child.
    expect(expandLabels({ nodes: [...graph.nodes, { id: "d", label: "Copy" }], edges: [...graph.edges, { from: "r", to: "d" }] }, "copy")).toEqual(["Site", "Press", "Ads"])
  })
})

describe("mindKey", () => {
  const k = (key: string, more: Partial<KeyboardEvent> = {}) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...more })
  it("Tab adds a child, Enter a sibling, a letter edits, Delete removes; chords and other keys pass", () => {
    expect(mindKey(k("Tab"), false)).toBe("child")
    expect(mindKey(k("Enter"), false)).toBe("sibling")
    expect(mindKey(k("x"), false)).toBe("edit")
    expect(mindKey(k("Delete"), false)).toBe("delete")
    expect(mindKey(k("Backspace"), false)).toBe("delete")
    expect(mindKey(k("z", { ctrlKey: true }), false)).toBeNull()
    expect(mindKey(k("ArrowLeft"), false)).toBeNull()
    expect(mindKey(k("Tab", { shiftKey: true }), false)).toBeNull()
  })
  it("in a node's words: Tab ends them and adds a child, Enter ends them, Shift+Enter is a new line", () => {
    expect(mindKey(k("Tab"), true)).toBe("child")
    expect(mindKey(k("Enter"), true)).toBe("commit")
    expect(mindKey(k("Enter", { shiftKey: true }), true)).toBeNull()
    expect(mindKey(k("x"), true)).toBeNull()
  })
})

describe("a generated mind map", () => {
  it("becomes a real map: the root nothing leads to, parents from the edges, branches alternating sides", async () => {
    const { mindMapOf } = await import("./mindMap")
    const graph = {
      nodes: [{ id: "c", label: "Plan", x: 0, y: 0 }, { id: "a", label: "A", x: 0, y: 0 }, { id: "b", label: "B", x: 0, y: 0 }, { id: "a1", label: "A1", x: 0, y: 0 }, { id: "lost", label: "Lost", x: 0, y: 0 }],
      edges: [{ from: "c", to: "a" }, { from: "c", to: "b" }, { from: "a", to: "a1" }, { from: "b", to: "a1" }, { from: "lost", to: "lost" }],
    }
    const out = mindMapOf(graph, { id: (x) => `g__${x}`, map: "g", dx: 10, font: 6 }) as { id: string; type: string; customData: { mindMap: Record<string, unknown> } }[]
    const tag = (id: string) => out.find((e) => e.id === `g__${id}`)!.customData.mindMap
    expect(tag("c")).toEqual({ map: "g", parent: null })
    expect(tag("a")).toEqual({ map: "g", parent: "g__c", side: "r" })
    expect(tag("b")).toEqual({ map: "g", parent: "g__c", side: "l" })
    expect(tag("a1")).toEqual({ map: "g", parent: "g__a" })
    expect(tag("lost").parent).toBe("g__c")
    expect(out.filter((e) => e.type === "arrow").map((e) => e.customData.mindMap.child)).toEqual(["g__a", "g__b", "g__a1", "g__lost"])
  })
})
