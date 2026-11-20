// Mind maps (miro-15): the ONE layout (a tree to positions, branches left and right of the root, nothing overlapping),
// run after every change to a map's shape; the tree a scene holds; a branch in tree order and as a doc outline; the
// children AI expand adds; the keys a selected node takes; and a new node or connector as Excalidraw builds it. A map
// is ordinary board elements tagged as ./mindMapTree reads them, so it rides the board's document as any element does.
// The board AI's mind maps and Cluster's summary map are laid out here too. Pure; loaded on first use.

import { mindTag, type MindTag } from "./mindMapTree"

export type Side = "l" | "r"
export interface MindNode {
  id: string
  parent: string | null
  side?: Side
  folded?: boolean
  x: number
  y: number
  w: number
  h: number
}
type At = { x: number; y: number; side: Side }

const GAP_X = 64
const GAP_Y = 16

/** Each node's children, top to bottom as they stand (a new sibling is placed just under the one it follows). */
function childrenOf(nodes: readonly MindNode[]): Map<string, MindNode[]> {
  const out = new Map<string, MindNode[]>()
  for (const n of nodes) if (n.parent) out.set(n.parent, [...(out.get(n.parent) ?? []), n])
  for (const list of out.values()) list.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1))
  return out
}

const rootOf = (nodes: readonly MindNode[]) => nodes.find((n) => n.parent === null)

/** How tall each node's branch stands: itself, or its open children stacked. */
function heights(nodes: readonly MindNode[], kids: Map<string, MindNode[]>): Map<string, number> {
  const out = new Map<string, number>()
  const tall = (n: MindNode): number => {
    const ks = n.folded ? [] : (kids.get(n.id) ?? [])
    const stacked = ks.reduce((s, k) => s + tall(k), 0) + GAP_Y * Math.max(0, ks.length - 1)
    const h = Math.max(n.h, stacked)
    out.set(n.id, h)
    return h
  }
  const root = rootOf(nodes)
  if (root) tall(root)
  return out
}

const sideOf = (n: MindNode): Side => (n.side === "l" ? "l" : "r")

/**
 * THE mind map layout. The root stays where it stands; its branches go to their side (right unless told left), each
 * side's children stacked by their branches' heights and centred on their parent, one gap further out per level. A
 * folded node's branch takes no room and gets no place. Same tree, same answer. Pure.
 */
export function layoutMindMap(nodes: readonly MindNode[]): Map<string, At> {
  const out = new Map<string, At>()
  const root = rootOf(nodes)
  if (!root) return out
  const kids = childrenOf(nodes)
  const tall = heights(nodes, kids)
  const place = (parent: MindNode, px: number, py: number, side: Side, ks: readonly MindNode[]) => {
    const total = ks.reduce((s, k) => s + tall.get(k.id)!, 0) + GAP_Y * Math.max(0, ks.length - 1)
    let top = py + parent.h / 2 - total / 2
    for (const k of ks) {
      const band = tall.get(k.id)!
      const x = side === "r" ? px + parent.w + GAP_X : px - GAP_X - k.w
      const y = top + band / 2 - k.h / 2
      out.set(k.id, { x, y, side })
      if (!k.folded) place(k, x, y, side, kids.get(k.id) ?? [])
      top += band + GAP_Y
    }
  }
  out.set(root.id, { x: root.x, y: root.y, side: "r" })
  const first = root.folded ? [] : (kids.get(root.id) ?? [])
  place(root, root.x, root.y, "r", first.filter((k) => sideOf(k) === "r"))
  place(root, root.x, root.y, "l", first.filter((k) => sideOf(k) === "l"))
  return out
}

/** The side a new branch of the root goes to: the shorter one (right on a tie). */
export function newSide(nodes: readonly MindNode[], rootId: string): Side {
  const kids = childrenOf(nodes)
  const tall = heights(nodes, kids)
  const sum = (s: Side) => (kids.get(rootId) ?? []).filter((k) => sideOf(k) === s).reduce((t, k) => t + tall.get(k.id)! + GAP_Y, 0)
  return sum("l") < sum("r") ? "l" : "r"
}

type El = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  containerId?: string | null
  points?: readonly (readonly number[])[]
  customData?: Record<string, unknown> | null
}

/** A map's live nodes in a scene, as the layout reads them. */
export function mapOf(elements: readonly El[], map: string): MindNode[] {
  const out: MindNode[] = []
  for (const el of elements) {
    const t = mindTag(el)
    if (!t || t.map !== map || t.child || el.isDeleted) continue
    out.push({ id: el.id, parent: t.parent ?? null, side: t.side, folded: t.folded, x: el.x, y: el.y, w: el.width, h: el.height })
  }
  return out
}

/** A node and everything under it, in tree order (each node before its children, children top to bottom). */
export function branchOf(nodes: readonly MindNode[], id: string): string[] {
  const kids = childrenOf(nodes)
  const out: string[] = []
  const walk = (n: string, depth: number) => {
    if (depth > nodes.length) return
    out.push(n)
    for (const k of kids.get(n) ?? []) walk(k.id, depth + 1)
  }
  if (nodes.some((n) => n.id === id)) walk(id, 0)
  return out
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A branch as a doc's body: nested bullets in tree order, each node's words escaped. */
export function outlineHtml(nodes: readonly MindNode[], wordsOf: (id: string) => string, id: string): string {
  const kids = childrenOf(nodes)
  const item = (n: string, depth: number): string => {
    const ks = depth > nodes.length ? [] : (kids.get(n) ?? [])
    return `<li><p>${esc(wordsOf(n).trim())}</p>${ks.length ? `<ul>${ks.map((k) => item(k.id, depth + 1)).join("")}</ul>` : ""}</li>`
  }
  return `<ul>${item(id, 0)}</ul>`
}

/** A connector from a parent's side to its child's facing side. */
export function edgeBetween(from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }, side: Side) {
  const x = side === "r" ? from.x + from.w : from.x
  const y = from.y + from.h / 2
  const dx = (side === "r" ? to.x : to.x + to.w) - x
  const dy = to.y + to.h / 2 - y
  return { x, y, width: Math.abs(dx), height: Math.abs(dy), points: [[0, 0], [dx, dy]] as [number, number][] }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5

/**
 * A map laid out again: copies of the nodes that move (their words moved with them) and of the connectors whose ends
 * moved, for the caller to bump and write in one change. Nothing when it already stands laid out. Pure.
 */
export function relayout<T extends El>(elements: readonly T[], map: string): T[] {
  const nodes = mapOf(elements, map)
  const at = layoutMindMap(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const moved = new Map<string, { dx: number; dy: number }>()
  const out: T[] = []
  for (const n of nodes) {
    const p = at.get(n.id)
    if (!p || (near(p.x, n.x) && near(p.y, n.y))) continue
    moved.set(n.id, { dx: p.x - n.x, dy: p.y - n.y })
  }
  const box = (id: string) => {
    const n = byId.get(id)!
    const p = at.get(id)
    return { x: p?.x ?? n.x, y: p?.y ?? n.y, w: n.w, h: n.h }
  }
  for (const el of elements) {
    if (el.isDeleted) continue
    const t: MindTag | undefined = mindTag(el)
    const own = moved.get(el.id) ?? (el.containerId ? moved.get(el.containerId) : undefined)
    if (own && (!t || !t.child)) {
      out.push({ ...el, x: el.x + own.dx, y: el.y + own.dy })
      continue
    }
    if (!t?.child || t.map !== map) continue
    const child = byId.get(t.child)
    const parent = child?.parent ? byId.get(child.parent) : undefined
    if (!child || !parent || !at.has(child.id)) continue
    const e = edgeBetween(box(parent.id), box(child.id), at.get(child.id)!.side)
    const same = near(e.x, el.x) && near(e.y, el.y) && el.points?.length === 2 && near(e.points[1][0], el.points[1][0]) && near(e.points[1][1], el.points[1][1])
    if (!same) out.push({ ...el, ...e })
  }
  return out
}

/** A generated mind map's root: the node nothing leads to, else its first (the server puts the root first). */
function generatedRoot<N extends { id: string }>(graph: { nodes: readonly N[]; edges: readonly { to: string }[] }): N | undefined {
  const fed = new Set(graph.edges.map((e) => e.to))
  return graph.nodes.find((n) => !fed.has(n.id)) ?? graph.nodes[0]
}

/**
 * AI expand's new children: the words of the root's branches in a generated mind map, 3 to 6, else null. Never the
 * expanded node's `own` words.
 */
export function expandLabels(graph: { nodes: readonly { id: string; label: string }[]; edges: readonly { from: string; to: string }[] }, own = ""): string[] | null {
  const root = generatedRoot(graph)?.id
  const near = new Set(graph.edges.flatMap((e) => (e.from === root && e.to !== root ? [e.to] : [])))
  const self = own.trim().toLowerCase()
  const words: string[] = []
  for (const n of graph.nodes) {
    const w = n.label.trim()
    if (near.has(n.id) && w && w.toLowerCase() !== self && !words.includes(w)) words.push(w)
  }
  return words.length >= 3 ? words.slice(0, 6) : null
}

export type MindAction = "child" | "sibling" | "edit" | "delete" | "commit"
/** What a key does to a selected mind map node (or in its words, `editing`); null leaves it to the board. */
export function mindKey(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, editing: boolean): MindAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key === "Tab") return e.shiftKey ? null : "child"
  if (editing) return e.key === "Enter" && !e.shiftKey ? "commit" : null
  if (e.key === "Enter") return e.shiftKey ? null : "sibling"
  if (e.key === "Delete" || e.key === "Backspace") return "delete"
  return e.key.length === 1 && e.key !== " " ? "edit" : null
}

/** The branch colours: each of the root's branches takes the next, and its children keep it. */
export const BRANCH_INKS = [
  { stroke: "#2563eb", fill: "#dbeafe" },
  { stroke: "#059669", fill: "#d1fae5" },
  { stroke: "#d97706", fill: "#fef3c7" },
  { stroke: "#e11d48", fill: "#ffe4e6" },
  { stroke: "#0891b2", fill: "#cffafe" },
  { stroke: "#7c3aed", fill: "#ede9fe" },
] as const
export const ROOT_INK = { stroke: "#4c1d95", fill: "#f5f3ff" }
export const NODE_SIZE = { w: 180, h: 48 }
export const ROOT_SIZE = { w: 220, h: 64 }

/** A new node as convertToExcalidrawElements takes it: a rounded box with its words, tagged as the map's. */
export function nodeSkeleton(o: { id: string; tag: MindTag; text: string; x: number; y: number; ink: { stroke: string; fill: string }; font: number }) {
  const root = o.tag.parent == null
  const size = root ? ROOT_SIZE : NODE_SIZE
  return {
    type: "rectangle",
    id: o.id,
    x: o.x,
    y: o.y,
    width: size.w,
    height: size.h,
    backgroundColor: o.ink.fill,
    strokeColor: o.ink.stroke,
    fillStyle: "solid",
    strokeWidth: root ? 2 : 1.5,
    roughness: 0,
    roundness: { type: 3 },
    customData: { mindMap: o.tag },
    label: { text: o.text, fontSize: root ? 20 : 16, fontFamily: o.font, strokeColor: "#1f2933" },
  }
}

/** A new connector from a parent to its child, bound at both ends (relayout draws it between them). */
export function edgeSkeleton(o: { id: string; map: string; parent: string; child: string; stroke: string }) {
  return {
    type: "arrow",
    id: o.id,
    x: 0,
    y: 0,
    start: { id: o.parent },
    end: { id: o.child },
    strokeColor: o.stroke,
    strokeWidth: 1.5,
    roughness: 0,
    endArrowhead: null,
    customData: { mindMap: { map: o.map, child: o.child } },
  }
}

type Generated = { nodes: readonly { id: string; label: string; x: number; y: number }[]; edges: readonly { from: string; to: string }[] }

/**
 * A generated mind map (the board AI's, Cluster's summary) as a real map: its tree read from the edges (the node
 * nothing leads to is the root; a node's first edge in names its parent; one with none hangs off the root), tagged
 * nodes and connectors, the root's branches alternating right and left, each branch in its colour. Lay it out after.
 */
export function mindMapOf(graph: Generated, o: { id: (nodeId: string) => string; map: string; dx: number; font: number }) {
  const ids = new Set(graph.nodes.map((n) => n.id))
  const root = generatedRoot(graph)
  if (!root) return []
  const parent = new Map<string, string>()
  for (const e of graph.edges) if (e.to !== root.id && e.from !== e.to && ids.has(e.from) && ids.has(e.to) && !parent.has(e.to)) parent.set(e.to, e.from)
  for (const n of graph.nodes) if (n.id !== root.id && !parent.has(n.id)) parent.set(n.id, root.id)
  const first = graph.nodes.filter((n) => parent.get(n.id) === root.id).map((n) => n.id)
  const branch = (id: string) => {
    let at = id
    for (let k = 0; k < graph.nodes.length && parent.has(at) && parent.get(at) !== root.id; k++) at = parent.get(at)!
    return Math.max(0, first.indexOf(at))
  }
  const ink = (id: string) => (id === root.id ? ROOT_INK : BRANCH_INKS[branch(id) % BRANCH_INKS.length])
  const out: Record<string, unknown>[] = []
  for (const n of graph.nodes) {
    const up = parent.get(n.id)
    const tag: MindTag = up ? { map: o.map, parent: o.id(up), ...(up === root.id ? { side: branch(n.id) % 2 ? "l" : "r" } : {}) } : { map: o.map, parent: null }
    out.push(nodeSkeleton({ id: o.id(n.id), tag, text: n.label, x: n.x + o.dx, y: n.y, ink: ink(n.id), font: o.font }))
  }
  for (const n of graph.nodes) {
    const up = parent.get(n.id)
    if (up) out.push(edgeSkeleton({ id: o.id(`edge-${n.id}`), map: o.map, parent: o.id(up), child: o.id(n.id), stroke: ink(n.id).stroke }))
  }
  return out
}
