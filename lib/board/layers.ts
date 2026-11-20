// Layers on a board (miro-03): named layers that show, hide, lock and reorder, kept in the board's shared document
// beside the protected objects' record (./protection): a map "layers", a layer's id -> { id, name, order, hidden,
// locked, deletedAt }. An element's layer is its customData.layerId; one without (a shape drawn today, a board from
// before layers) or of a deleted layer is on Layer 1, which is there before anyone writes it, holds new work, and is
// never hidden or deleted. Deleting a layer only stamps deletedAt: nothing is erased, and its elements are Layer 1's.
// Board editors write the map (the collaboration server keeps only editors' sockets writable); everyone reads it.
//
// Here: the record as the board reads it, the record's changes (each refusal says why), and what a layer does to the
// drawing, all pure: who is hidden (splitHidden, the one filter boardExcalidraw draws through), a layer's elements
// moved to another layer or locked (assignLayer, lockLayer: changed copies, bumped so every tab takes them), and the
// stack in layer order (restack: null when it already is). A protected object (miro-44) is never changed by a layer.

import * as React from "react"
import type * as Y from "yjs"
import type { SceneData } from "@excalidraw/excalidraw/types"
import { CAPTURE, bumped, mergeShared, type BoardElement, type SceneApi, type Guarded, type SceneGuard } from "./binding"
import { foldedAway, isFoldedNode } from "./mindMapTree"

/** The record's map in the board's document. */
export const LAYERS = "layers"
/** Layer 1: every element without a layer of its own. */
export const HOME_LAYER = "layer-1"
/** The most layers a board keeps, and the longest name one takes. */
export const MAX_LAYERS = 50
export const MAX_LAYER_NAME = 60

export interface Layer {
  id: string
  name: string
  /** Its place in the stack: higher draws over lower. */
  order: number
  hidden: boolean
  locked: boolean
  /** When it was deleted (ms), 0 while it's live. */
  deletedAt: number
}

/** The board's live layers, bottom first. */
export type Layers = readonly Layer[]

const HOME: Layer = { id: HOME_LAYER, name: "Layer 1", order: 0, hidden: false, locked: false, deletedAt: 0 }
export const ONLY_HOME: Layers = [HOME]

type LayerMap = Pick<Y.Map<unknown>, "size" | "forEach">

function parsed(id: string, v: unknown): Layer {
  const p = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof Layer, unknown>>
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
  return {
    id,
    name: typeof p.name === "string" && p.name.trim() ? p.name : id === HOME_LAYER ? HOME.name : "Layer",
    order: num(p.order),
    // Layer 1 holds new work, so it never hides (a fresh shape would vanish) and is never deleted.
    hidden: id !== HOME_LAYER && p.hidden === true,
    locked: p.locked === true,
    deletedAt: id === HOME_LAYER ? 0 : num(p.deletedAt),
  }
}

/** The live layers as the document holds them, bottom first; Layer 1 is there whether or not it was written. */
export function readLayers(map: LayerMap): Layers {
  if (map.size === 0) return ONLY_HOME
  const out: Layer[] = []
  let home = false
  map.forEach((v, id) => {
    const l = parsed(id, v)
    if (l.deletedAt > 0) return
    home ||= id === HOME_LAYER
    out.push(l)
  })
  if (!home) out.push(HOME)
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The board's layers, read again whenever any tab changes them. */
export function useLayers(doc: Y.Doc): Layers {
  const map = React.useMemo(() => doc.getMap<unknown>(LAYERS), [doc])
  const [layers, setLayers] = React.useState<Layers>(() => readLayers(map))
  React.useEffect(() => {
    const read = () => setLayers(readLayers(map))
    read()
    map.observe(read)
    return () => map.unobserve(read)
  }, [map])
  return layers
}

export type LayerElement = BoardElement & {
  customData?: Record<string, unknown> | null
  containerId?: string | null
  frameId?: string | null
  locked?: boolean
}

/** An element's own layer, if it names a live one. */
const ownLayer = (el: LayerElement, live: ReadonlyMap<string, number>): string | null => {
  const id = el.customData?.layerId
  return typeof id === "string" && live.has(id) ? id : null
}

/**
 * Each element's layer: its own, else (a shape's words) its container's, else Layer 1. Pure.
 */
export function layerIds<T extends LayerElement>(elements: readonly T[], layers: Layers): Map<string, string> {
  const live = new Map(layers.map((l, i) => [l.id, i]))
  const byId = new Map<string, T>()
  for (const el of elements) byId.set(el.id, el)
  const out = new Map<string, string>()
  for (const el of elements) {
    let id = ownLayer(el, live)
    if (!id && el.containerId) {
      const box = byId.get(el.containerId)
      id = box ? ownLayer(box, live) : null
    }
    out.set(el.id, id ?? HOME_LAYER)
  }
  return out
}

/** The ids of the hidden layers. */
export function hiddenLayers(layers: Layers): ReadonlySet<string> {
  const out = new Set<string>()
  for (const l of layers) if (l.hidden) out.add(l.id)
  return out
}

/** The elements drawn, and the hidden layers' and folded mind map branches' (never drawn, never deleted); `keep`'s
 * stay drawn whatever their layer or fold (the words a person is typing, and their box, until the words end). Pure. */
export function splitHidden<T extends LayerElement>(elements: readonly T[], layers: Layers, keep?: ReadonlySet<string>): { shown: T[]; hidden: T[] } {
  const off = hiddenLayers(layers)
  const away = foldedAway(elements)
  if (off.size === 0 && away.size === 0) return { shown: elements as T[], hidden: [] }
  const of = layerIds(elements, layers)
  const shown: T[] = []
  const hidden: T[] = []
  for (const el of elements) ((away.has(el.id) || off.has(of.get(el.id)!)) && !keep?.has(el.id) ? hidden : shown).push(el)
  return { shown, hidden }
}

/**
 * The stack in layer order: every element of a higher layer over every element of a lower one, each layer's own
 * order kept (a stable sort; Excalidraw then re-numbers the moved ones). Null when the live elements already stack in
 * layer order, so a check that finds nothing writes nothing. Pure.
 */
export function restack<T extends LayerElement>(elements: readonly T[], layers: Layers): T[] | null {
  if (layers.length < 2) return null
  const rank = new Map(layers.map((l, i) => [l.id, i]))
  const of = layerIds(elements, layers)
  const rankOf = (el: T) => rank.get(of.get(el.id)!) ?? 0
  let top = -1
  let broken = false
  for (const el of elements) {
    if (el.isDeleted) continue
    const r = rankOf(el)
    if (r < top) {
      broken = true
      break
    }
    top = r
  }
  if (!broken) return null
  return elements
    .map((el, i) => ({ el, i, r: rankOf(el) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.el)
}

type Protected = { has(id: string): boolean }

/**
 * Moves the chosen elements to a layer: their words and, for a frame, what's in it go too, and they take the layer's
 * lock. A protected object stays where it is (the server would put it back). Changed copies. Pure.
 */
export function assignLayer<T extends LayerElement>(elements: readonly T[], ids: Iterable<string>, layer: Layer, protectedIds?: Protected): T[] {
  const chosen = new Set(ids)
  for (const el of elements) if ((el.containerId && chosen.has(el.containerId)) || (el.frameId && chosen.has(el.frameId))) chosen.add(el.id)
  const out: T[] = []
  for (const el of elements) {
    if (!chosen.has(el.id) || el.isDeleted || protectedIds?.has(el.id)) continue
    const locked = layer.locked ? true : el.locked === true
    if (el.customData?.layerId === layer.id && locked === (el.locked === true)) continue
    out.push(bumped(el, { customData: { ...(el.customData ?? {}), layerId: layer.id }, locked } as unknown as Partial<T>))
  }
  return out
}

/** A layer's elements locked or unlocked (Excalidraw's own lock: any editor lifts it). Protected ones untouched. Pure. */
export function lockLayer<T extends LayerElement>(elements: readonly T[], layerId: string, locked: boolean, layers: Layers, protectedIds?: Protected): T[] {
  const of = layerIds(elements, layers)
  const out: T[] = []
  for (const el of elements) {
    if (el.isDeleted || of.get(el.id) !== layerId || protectedIds?.has(el.id) || (el.locked === true) === locked) continue
    out.push(bumped(el, { locked } as unknown as Partial<T>))
  }
  return out
}

/** The scene with these copies in place of their elements. Pure. */
export function withCopies<T extends BoardElement>(elements: readonly T[], copies: readonly T[]): T[] {
  if (copies.length === 0) return elements as T[]
  const by = new Map(copies.map((c) => [c.id, c]))
  return elements.map((el) => by.get(el.id) ?? el)
}

// The record's changes. Each writes the map (inside the caller's transaction) and answers null, or why it refused.

type Writable = Pick<Y.Map<unknown>, "size" | "forEach" | "get" | "set">

const write = (map: Writable, l: Layer) => map.set(l.id, { ...l })
const find = (map: Writable, id: string): Layer | undefined => readLayers(map).find((l) => l.id === id)

/** A layer's name as kept, or why it can't be. */
export function layerName(name: string): { name: string } | { refused: string } {
  const n = name.replace(/\s+/g, " ").trim()
  if (!n) return { refused: "A layer needs a name." }
  if (n.length > MAX_LAYER_NAME) return { refused: `A layer's name fits in ${MAX_LAYER_NAME} characters.` }
  return { name: n }
}

/** A new layer on top of the stack, named "Layer N" after the highest so far. */
export function addLayer(map: Writable, now = Date.now()): { layer: Layer } | { refused: string } {
  const live = readLayers(map)
  if (live.length >= MAX_LAYERS) return { refused: `A board holds up to ${MAX_LAYERS} layers.` }
  let n = live.length + 1
  const names = new Set(live.map((l) => l.name))
  while (names.has(`Layer ${n}`)) n++
  const layer: Layer = { id: `layer-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: `Layer ${n}`, order: live[live.length - 1].order + 1, hidden: false, locked: false, deletedAt: 0 }
  write(map, layer)
  return { layer }
}

export function renameLayer(map: Writable, id: string, name: string): string | null {
  const l = find(map, id)
  if (!l) return "That layer was deleted."
  const n = layerName(name)
  if ("refused" in n) return n.refused
  if (n.name !== l.name) write(map, { ...l, name: n.name })
  return null
}

export function hideLayer(map: Writable, id: string, hidden: boolean): string | null {
  const l = find(map, id)
  if (!l) return "That layer was deleted."
  if (hidden && id === HOME_LAYER) return "Layer 1 holds new work, so it always shows."
  if (l.hidden !== hidden) write(map, { ...l, hidden })
  return null
}

/** The layer's record lock (its elements' lock is lockLayer's). */
export function markLocked(map: Writable, id: string, locked: boolean): string | null {
  const l = find(map, id)
  if (!l) return "That layer was deleted."
  if (l.hidden) return "Show the layer to lock or unlock it."
  if (l.locked !== locked) write(map, { ...l, locked })
  return null
}

/** Moves a layer to `to` (its place counted from the bottom), renumbering the stack 0..n-1. */
export function moveLayer(map: Writable, id: string, to: number): string | null {
  const live = readLayers(map).slice()
  const from = live.findIndex((l) => l.id === id)
  if (from < 0) return "That layer was deleted."
  const at = Math.max(0, Math.min(live.length - 1, to))
  if (at === from) return null
  const [l] = live.splice(from, 1)
  live.splice(at, 0, l)
  live.forEach((x, i) => x.order !== i && write(map, { ...x, order: i }))
  return null
}

/** Deletes a layer softly: deletedAt only; its elements are Layer 1's from now on, nothing erased. */
export function deleteLayer(map: Writable, id: string, now = Date.now()): string | null {
  if (id === HOME_LAYER) return "Layer 1 holds new work, so it stays."
  const l = find(map, id)
  if (!l) return "That layer was deleted."
  write(map, { ...l, hidden: false, deletedAt: now })
  return null
}

/** What a tab's canvas needs of the scene to draw it in layers: the binding's scene (Excalidraw's API, or a stand-in). */
export type LayerSceneApi = SceneApi

/**
 * The scene as this tab draws it: the API every part of the board is handed, whose updateScene draws only what the
 * hidden layers leave and keeps the latest copy of each hidden element aside (so it is never drawn, never written
 * back and never deleted: the document keeps it, a reload and other tabs read it there). `show` follows the record:
 * a layer hidden leaves the scene at once, one shown comes back in its stacking place. Find, export and the board's
 * AI read the scene, so a hidden layer is hidden from them too.
 */
export function layeredScene<A extends LayerSceneApi>(api: A): { api: A & Guarded; show(layers: Layers): void; adopt(): void } & SceneGuard {
  let layers: Layers = ONLY_HOME
  let off = hiddenLayers(layers)
  const aside = new Map<string, LayerElement>()
  const drawn = () => api.getSceneElementsIncludingDeleted() as LayerElement[]
  // N3: the ids this tab knows: what it held when a layer was hidden, the document's copies since (NEVER writes), and
  // what the rest re-split has seen. One it doesn't know is this tab's new work (drawn, pasted, a library item:
  // Excalidraw puts it in the scene itself), and adopt moves it off a hidden layer.
  const known = new Set<string>()
  const learn = (handed: readonly LayerElement[]) => {
    let inScene: Set<string> | null = null
    for (const el of handed) {
      if (known.has(el.id)) continue
      inScene ??= new Set(drawn().map((e) => e.id))
      if (!inScene.has(el.id)) known.add(el.id)
    }
  }
  // The words a person is typing, and their box, stay drawn until the words end (CR-420 F2): Excalidraw keeps its
  // editor open over a scene that lost them, but each keystroke's update and its submit miss the element, so every word
  // typed after another tab's hide would drop. The rest-run (useLayeredScene) waits for the words to end, then splits
  // again and sets them aside.
  const typing = (): ReadonlySet<string> | undefined => {
    const t = (api as { getAppState?(): Gesture }).getAppState?.()?.editingTextElement
    return t ? new Set(t.containerId ? [t.id, t.containerId] : [t.id]) : undefined
  }
  // The board as this tab knows it, what it is handed and what it set aside, split again: a hidden element is kept
  // aside, and one no longer hidden (a layer shown, a mind map branch unfolded) comes back in its stacking place.
  const split = (handed: readonly LayerElement[]): { shown: readonly LayerElement[]; moved: boolean } => {
    if (layers.length < 2 && aside.size === 0 && !handed.some(isFoldedNode)) return { shown: handed, moved: false }
    const ids = new Set(handed.map((el) => el.id))
    const { shown, hidden } = splitHidden([...handed, ...[...aside.values()].filter((el) => !ids.has(el.id))], layers, typing())
    aside.clear()
    for (const el of hidden) aside.set(el.id, el)
    const back = shown.filter((el) => !ids.has(el.id))
    const moved = back.length > 0 || hidden.some((el) => ids.has(el.id))
    return { shown: back.length ? mergeShared(shown.filter((el) => ids.has(el.id)), back).elements : shown, moved }
  }
  // Each caller's write says whose undo it is (components/board/boardUndoGuard.test.ts) and lands as it was handed.
  // What the filter does to it (a branch a fold hides, or one an unfold brings back) lands after it outside undo, as
  // show's does: Excalidraw records an element that leaves the scene inside an undo step as removed, so undoing the
  // unfold, or redoing the fold, would delete the branch.
  const updateScene = (scene: SceneData) => {
    if (!scene.elements) return api.updateScene(scene)
    if (off.size && scene.captureUpdate === CAPTURE.NEVER) learn(scene.elements as unknown as LayerElement[])
    const { shown, moved } = split(scene.elements as unknown as LayerElement[])
    if (!moved || scene.captureUpdate === CAPTURE.NEVER) return api.updateScene({ ...scene, elements: shown as never, captureUpdate: scene.captureUpdate })
    api.updateScene(scene)
    api.updateScene({ elements: shown as never, captureUpdate: CAPTURE.NEVER })
  }
  const guard: SceneGuard = {
    // The guard's predicate (binding.ts changedElements): the filter set the element, or its container, aside. Every
    // show and write splits what it sees, so work drawn past the filter is the person's own: its delete stores.
    setAside(el) {
      const box = (el as LayerElement).containerId
      return aside.has(el.id) || (!!box && aside.has(box))
    },
    // What the store refused: the document's live copy goes back aside (unless a live one is kept there), and the
    // scene drops the deleted copy, outside undo, so Show draws the element as the document holds it.
    restore(copies) {
      if (copies.length === 0) return
      const ids = new Set(copies.map((el) => el.id))
      for (const el of copies) if (!aside.get(el.id) || aside.get(el.id)!.isDeleted) aside.set(el.id, el)
      const { shown } = split(drawn().filter((el) => !ids.has(el.id)))
      api.updateScene({ elements: shown as never, captureUpdate: CAPTURE.NEVER })
    },
  }
  const wrapped = { ...api, updateScene, sceneGuard: guard } as unknown as A & Guarded
  return {
    api: wrapped,
    ...guard,
    show(next) {
      const grew = [...hiddenLayers(next)].some((id) => !off.has(id))
      layers = next
      off = hiddenLayers(next)
      if (grew) for (const el of [...drawn(), ...aside.values()]) known.add(el.id)
      const { shown, moved } = split(api.getSceneElementsIncludingDeleted() as LayerElement[])
      if (moved) api.updateScene({ elements: shown as never, captureUpdate: CAPTURE.NEVER })
    },
    // N3, at the drawing's rest: this tab's new work on a hidden layer moves to the top shown layer (Layer 1 always
    // shows), outside undo: no later Undo puts it back, and a Redo of the paste takes its new layer; all seen is known.
    adopt() {
      const scene = drawn()
      const ids = new Set(scene.map((el) => el.id))
      const all = [...scene, ...[...aside.values()].filter((el) => !ids.has(el.id))]
      const fresh = off.size ? all.filter((el) => !known.has(el.id) && !el.isDeleted) : []
      for (const el of all) known.add(el.id)
      if (fresh.length === 0) return
      const of = layerIds(all, layers)
      const top = [...layers].reverse().find((l) => !l.hidden)!
      const moved = assignLayer(all, fresh.filter((el) => off.has(of.get(el.id)!)).map((el) => el.id), top)
      if (moved.length) updateScene({ elements: [...withCopies(scene, moved), ...moved.filter((el) => !ids.has(el.id))] as never, captureUpdate: CAPTURE.NEVER })
    },
  }
}

/** Re-stacks the drawn scene in layer order, outside undo (Excalidraw re-numbers the moved ones, and the canvas's own
 * change writes them as any edit). True when anything moved. */
export function restackScene(api: LayerSceneApi, layers: Layers): boolean {
  const next = restack(api.getSceneElementsIncludingDeleted() as LayerElement[], layers)
  if (next) api.updateScene({ elements: next as never, captureUpdate: CAPTURE.NEVER })
  return next !== null
}

type Gesture = {
  newElement?: unknown
  resizingElement?: unknown
  multiElement?: unknown
  editingTextElement?: { id: string; containerId?: string | null } | null
  selectedElementsAreBeingDragged?: boolean
}
/** How long a drawing rests before a broken layer order is re-stacked: a fresh shape never stays on a higher layer. */
export const RESTACK_MS = 150

/**
 * A canvas drawn in layers (boardExcalidraw, for every board that draws): `wrap` hands out the API whose scene leaves
 * the hidden layers out (layeredScene), following the board's record as any tab changes it; `changed` hears each
 * scene change and, for an editor, once the drawing rests, follows a fold that undo or redo changed (its branch hidden
 * or brought back, outside undo) and re-stacks when the drawn order breaks layer order (a fresh shape lands on top of
 * the stack, wherever its layer is). restack is null when in order, so nothing loops.
 */
export function useLayeredScene(doc: Y.Doc | undefined, editable: boolean) {
  const view = React.useRef<{ raw: LayerSceneApi & { getAppState?(): Gesture }; show(l: Layers): void; adopt(): void } | null>(null)
  const layers = React.useRef<Layers>(ONLY_HOME)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const seen = React.useRef<readonly unknown[] | null>(null)
  const [raw, setRaw] = React.useState<object | null>(null)
  const wrap = React.useCallback(<A extends LayerSceneApi>(api: A): A & Guarded => {
    const v = layeredScene(api)
    view.current = { raw: api, show: v.show, adopt: v.adopt }
    setRaw(api)
    return v.api
  }, [])
  React.useEffect(() => {
    if (!doc || !raw) return
    const map = doc.getMap<unknown>(LAYERS)
    const read = () => {
      layers.current = readLayers(map)
      view.current?.show(layers.current)
    }
    read()
    map.observe(read)
    return () => map.unobserve(read)
  }, [doc, raw])
  React.useEffect(() => {
    const t = timer
    return () => {
      if (t.current) clearTimeout(t.current)
    }
  }, [])
  const changed = React.useCallback(
    (elements: readonly unknown[]) => {
      if (!editable || elements === seen.current) return
      seen.current = elements
      const run = () => {
        timer.current = null
        const v = view.current
        if (!v) return
        const s = v.raw.getAppState?.()
        if (s && (s.newElement || s.resizingElement || s.multiElement || s.editingTextElement || s.selectedElementsAreBeingDragged)) {
          timer.current = setTimeout(run, RESTACK_MS)
          return
        }
        // This tab's new work leaves a hidden layer (N3); undo and redo restore an element inside Excalidraw, past the
        // filter: one on a hidden layer leaves here. Undo and redo change a fold there too: its branch follows here,
        // outside undo.
        v.adopt()
        v.show(layers.current)
        if (layers.current.length > 1) restackScene(v.raw, layers.current)
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(run, RESTACK_MS)
    },
    [editable],
  )
  return { wrap, changed }
}
