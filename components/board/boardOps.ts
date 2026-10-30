"use client"

// What the board's tools do to the scene: add notes and frames, change notes,
// move things. Each change is one undo step of the person's own (IMMEDIATELY),
// and every element it touches gets a new version, which is what every other
// screen merges on (lib/board/binding). Loaded with the tools, never on the
// board's first screen.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { CAPTURE, bumped } from "@/lib/board/binding"
import {
  NOTE_COLOURS,
  NOTE_FONT_FLOOR,
  NOTE_SIZES,
  fitFontSize,
  isStickyNote,
  noteColourOf,
  noteSizeOf,
  noteSkeleton,
  type NoteColourId,
  type NoteSize,
  type NoteSkeleton,
} from "@/lib/board/notes"
import { copyElements, type CopyableElement } from "@/lib/board/copyElements"
import { newElementId } from "@/lib/board/ids"

/** An element as the tools read and write it. */
export interface SceneElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  version: number
  versionNonce?: number
  isDeleted?: boolean
  frameId?: string | null
  groupIds?: readonly string[]
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  customData?: Record<string, unknown>
  text?: string
  originalText?: string
  fontFamily?: number
  name?: string | null
  locked?: boolean
  link?: string | null
  index?: string | null
  backgroundColor?: string
  [key: string]: unknown
}

type Api = Pick<ExcalidrawImperativeAPI, "getSceneElementsIncludingDeleted" | "updateScene" | "getAppState">

const nonce = () => Math.floor(Math.random() * 2 ** 31)

function scene(api: Api): SceneElement[] {
  return api.getSceneElementsIncludingDeleted() as unknown as SceneElement[]
}

/** The words bound inside a shape, if it has any. */
export function boundText(byId: Map<string, SceneElement>, el: SceneElement): SceneElement | undefined {
  const t = el.boundElements?.find((b) => b.type === "text")
  return t ? byId.get(t.id) : undefined
}

/** Excalidraw's converter, from its lazy import: it lays a note's words out as Excalidraw itself does. */
export type Convert = (typeof import("@excalidraw/excalidraw"))["convertToExcalidrawElements"]

/** Excalidraw's names for its font ids (its FONT_FAMILY turned round), kept from the converter's own import. */
let faceNames: ReadonlyMap<number, string> = new Map()

/** Excalidraw's converter, for the notes it lays out: the one lazy import of it that new notes, sizes and typed words share. */
export async function loadConvert(): Promise<Convert> {
  const m = await import("@excalidraw/excalidraw")
  if (faceNames.size === 0 && "FONT_FAMILY" in m) faceNames = new Map(Object.entries(m.FONT_FAMILY).map(([name, id]) => [id, name]))
  return m.convertToExcalidrawElements
}

/**
 * Notes on this screen whose words were laid out before their face had come, by face. When a face lands, Excalidraw
 * only draws the words again (its Fonts.onLoaded keeps their line breaks and size), so they would spill past the note
 * in the real face: each is fitted again then, in the face itself. A face that can't come leaves the fit made in the
 * fallback face, which is the face the note is drawn in.
 */
const awaitingFace = new Map<string, Map<string, { api: Api; convert: Convert }>>()

/** Fits the note holding `text` again once the words' face has come, if it hasn't yet (miro-07). */
function fitWhenFaceLands(api: Api, convert: Convert, text: SceneElement): void {
  const fonts = typeof document === "undefined" ? undefined : document.fonts
  const name = typeof text.fontFamily === "number" ? faceNames.get(text.fontFamily) : undefined
  const words = text.originalText ?? text.text ?? ""
  if (!fonts || !name || !words) return
  const face = `${text.fontSize ?? 16}px "${name}"`
  if (fonts.check(face, words)) return
  let due = awaitingFace.get(face)
  if (!due) {
    due = new Map()
    awaitingFace.set(face, due)
    fonts.load(face, words).then(
      // A frame later, once Excalidraw has let go of the widths it measured without the face.
      () =>
        requestAnimationFrame(() => {
          const notes = awaitingFace.get(face)
          awaitingFace.delete(face)
          for (const [id, at] of notes ?? []) {
            try {
              // A correction of the layout, not a step of the person's: written NEVER, as Excalidraw writes a remote
              // change, so no undo step carries it, and undoing the person's next step can't bring the fallback face's
              // layout back. Words still being typed lose nothing: while an element has a change of the person's in
              // hand, Excalidraw's updateScene keeps its last committed copy, and the refit joins the typing's own step.
              fitTypedNote(at.api, at.convert, id, CAPTURE.NEVER)
            } catch {
              // The board has closed since: nothing left to fit.
            }
          }
        }),
      () => awaitingFace.delete(face),
    )
  }
  due.set(text.id, { api, convert })
}

/** A trial layout's id. Excalidraw keeps each note's height from before its words grew, by id, so a trial never writes over a note's own. */
const TRIAL_ID = "note-fit-trial"

/**
 * A note's rectangle and words from its skeleton, its words at the largest size, down to the floor, at which the
 * note keeps its side (miro-07); past the floor the note grows to hold them, as Excalidraw grows it. Each size is
 * laid out by Excalidraw's own converter, so the fit agrees with how Excalidraw wraps the words.
 */
function fittedNote(convert: Convert, sk: NoteSkeleton): SceneElement[] {
  const lay = (id: string, fontSize: number) =>
    convert([{ ...sk, id, label: { ...sk.label, fontSize } }] as never, { regenerateIds: false }) as unknown as SceneElement[]
  const fontSize = fitFontSize({ max: sk.label.fontSize, floor: NOTE_FONT_FLOOR, fits: (size) => lay(TRIAL_ID, size)[0].height <= sk.height })
  return lay(sk.id, fontSize)
}

/**
 * Adds notes as one undo step, selected, and returns their containers' ids
 * in order. The skeletons go through Excalidraw's own converter (lazy), which
 * lays out and wraps their words, each at the size that fits its note.
 */
export async function addNotes(api: Api, notes: NoteSkeleton[], opts: { select?: boolean; frameId?: string | null } = {}): Promise<string[]> {
  if (notes.length === 0) return []
  const convert = await loadConvert()
  const made = notes.flatMap((sk) => fittedNote(convert, sk))
  if (opts.frameId) for (const el of made) el.frameId = opts.frameId
  const ids = notes.map((n) => n.id)
  api.updateScene({
    elements: [...scene(api), ...made] as never,
    ...(opts.select === false ? {} : { appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } as never }),
    captureUpdate: CAPTURE.IMMEDIATELY,
  })
  for (const el of made) if (el.type === "text") fitWhenFaceLands(api, convert, el)
  return ids
}

/**
 * Lays copies of elements in the middle of the view as one undo step and
 * shows them: a team's template, later a .excalidraw file or a Miro board.
 * Every id is new and every reference follows it (lib/board/copyElements), so
 * a copy never points back where it came from. Returns the copies' ids.
 */
export function addCopies(
  api: Api & Pick<ExcalidrawImperativeAPI, "scrollToContent">,
  elements: readonly CopyableElement[],
  prefix: string,
  opts: { animate?: boolean } = {},
): string[] {
  if (elements.length === 0) return []
  const middle = viewMiddle(api)
  const copies = copyElements(elements, prefix, middle.x, middle.y)
  api.updateScene({ elements: [...scene(api), ...copies] as never, captureUpdate: CAPTURE.IMMEDIATELY })
  api.scrollToContent(copies as never, { fitToContent: true, animate: opts.animate ?? true })
  return copies.map((c) => c.id)
}

/** A frame element, as Excalidraw's own newFrameElement makes one, with a name and the preset it started from. */
export function frameElement(o: { id: string; x: number; y: number; width: number; height: number; name: string; preset?: string }): SceneElement {
  return {
    id: o.id,
    type: "frame",
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    angle: 0,
    strokeColor: "#bbb",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: nonce(),
    version: 1,
    versionNonce: nonce(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    name: o.name,
    ...(o.preset ? { customData: { preset: o.preset } } : {}),
  }
}

/** Adds a frame as one undo step, selected. */
export function addFrame(api: Api, frame: SceneElement): void {
  api.updateScene({
    elements: [...scene(api), frame] as never,
    appState: { selectedElementIds: { [frame.id]: true } } as never,
    captureUpdate: CAPTURE.IMMEDIATELY,
  })
}

/**
 * Changes elements as one undo step: `change` gives each element's new
 * fields (null leaves it alone); every changed element is bumped. `also`
 * adds new elements in the same step (on top), and selects some.
 */
export function changeElements(
  api: Api,
  change: (el: SceneElement, byId: Map<string, SceneElement>) => Partial<SceneElement> | null,
  also: { add?: readonly SceneElement[]; select?: readonly string[] } = {},
): number {
  const all = scene(api)
  const byId = new Map(all.map((e) => [e.id, e]))
  let n = 0
  const next = all.map((el) => {
    if (el.isDeleted) return el
    const c = change(el, byId)
    if (!c) return el
    n++
    return bumped(el, c)
  })
  const add = also.add ?? []
  if (n === 0 && add.length === 0) return 0
  api.updateScene({
    elements: [...next, ...add] as never,
    ...(also.select ? { appState: { selectedElementIds: Object.fromEntries(also.select.map((id) => [id, true])) } as never } : {}),
    captureUpdate: CAPTURE.IMMEDIATELY,
  })
  return n
}

/** Notes in a new colour: paper, edge and words. */
export function recolourNotes(api: Api, ids: ReadonlySet<string>, colour: NoteColourId): number {
  const c = NOTE_COLOURS[colour]
  return changeElements(api, (el) => {
    if (ids.has(el.id)) return { backgroundColor: c.fill, strokeColor: c.edge, customData: { ...(el.customData ?? {}), kind: "note", colour } }
    if (el.type === "text" && el.containerId && ids.has(el.containerId)) return { strokeColor: c.ink }
    return null
  })
}

/** Notes with new tags (lib/board/sticky normalises them first). */
export function tagNotes(api: Api, tagsFor: (el: SceneElement) => string[] | null): number {
  return changeElements(api, (el) => {
    const tags = tagsFor(el)
    if (!tags) return null
    const data = { ...(el.customData ?? {}) }
    if (tags.length) data.tags = tags
    else delete data.tags
    return { customData: data }
  })
}

/**
 * Notes at a new size, about their middles. A note's words are laid out
 * again by Excalidraw's converter, at the size that fits the new side (its
 * text element is replaced; the note keeps its id, its arrows, its frame and
 * everything it says about itself).
 */
export async function resizeNotes(api: Api, ids: ReadonlySet<string>, size: NoteSize): Promise<number> {
  const convert = await loadConvert()
  const all = scene(api)
  const byId = new Map(all.map((e) => [e.id, e]))
  const replaced = new Map<string, SceneElement>()
  const added: SceneElement[] = []
  const side = NOTE_SIZES[size]
  let n = 0
  for (const id of ids) {
    const note = byId.get(id)
    if (!note || note.isDeleted) continue
    n++
    const label = boundText(byId, note)
    const sk = noteSkeleton({
      id: note.id,
      x: note.x + note.width / 2 - side / 2,
      y: note.y + note.height / 2 - side / 2,
      text: label?.originalText ?? label?.text ?? "",
      colour: noteColourOf(note) ?? "yellow",
      size,
    })
    if (label?.fontFamily) sk.label.fontFamily = label.fontFamily
    // The words keep their own colour through a size, as they keep their face (V-95).
    if (typeof label?.strokeColor === "string") sk.label.strokeColor = label.strokeColor
    const [rect, text] = fittedNote(convert, sk)
    const keepBound = (note.boundElements ?? []).filter((b) => b.type !== "text")
    replaced.set(note.id, {
      ...note,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      customData: { ...(note.customData ?? {}), ...sk.customData },
      boundElements: [...keepBound, ...(text ? [{ type: "text", id: text.id }] : [])],
      version: note.version + 1,
      versionNonce: nonce(),
      updated: Date.now(),
    })
    if (label) replaced.set(label.id, bumped(label, { isDeleted: true }))
    if (text) added.push({ ...text, frameId: note.frameId ?? null, groupIds: note.groupIds ?? [] })
  }
  if (n === 0) return 0
  api.updateScene({ elements: [...all.map((e) => replaced.get(e.id) ?? e), ...added] as never, captureUpdate: CAPTURE.IMMEDIATELY })
  for (const el of added) if (el.type === "text") fitWhenFaceLands(api, convert, el)
  return n
}

/** How far a note's words are put off their size for one write, so Excalidraw's editor re-reads the note's height (V-104). */
const FLOOR_NUDGE = 0.01

/**
 * The most writes the fit makes to one note's words in one task (V-104's guard). Typing writes once a key and a face
 * landing once, so a note written more often than this in one task is in a tug-of-war with something else writing it
 * (as Excalidraw's editor did in V-104, to React's maximum update depth): the fit lets go of the note until the next
 * task, and says so once, and the board stays up.
 */
const FIT_WRITES_PER_TASK = 8
const fitWrites = new Map<string, number>()

/** Whether the fit may write the note holding `text` again in this task; past the guard it warns once and lets go. */
function fitMayWrite(text: SceneElement): boolean {
  if (fitWrites.size === 0) setTimeout(() => fitWrites.clear(), 0)
  const n = (fitWrites.get(text.id) ?? 0) + 1
  fitWrites.set(text.id, n)
  if (n === FIT_WRITES_PER_TASK + 1) {
    console.warn(`V-104 guard: the fit let go of note ${text.containerId} (words ${text.id}, version ${text.version}) after ${FIT_WRITES_PER_TASK} writes in one task`)
  }
  return n <= FIT_WRITES_PER_TASK
}

/**
 * Keeps the note whose words are being typed its own size (miro-07): as the words grow they come down to the
 * largest size, to the floor, at which they fit it, and they go back up as the words shrink; past the floor the
 * note grows, as Excalidraw grows it. Only a note at one of its three sizes: one sized by hand keeps Excalidraw's
 * own ways. The words keep their element and its id, since the editor is bound to it; only their size and layout
 * change, laid out as fittedNote lays them. It joins the typing's own undo step (EVENTUALLY), and writes only on a
 * change; the refit made when the words' face lands writes NEVER (fitWhenFaceLands). Returns whether it changed anything.
 */
export function fitTypedNote(
  api: Api,
  convert: Convert,
  textId: string,
  capture: typeof CAPTURE.EVENTUALLY | typeof CAPTURE.NEVER = CAPTURE.EVENTUALLY,
): boolean {
  const all = scene(api)
  const text = all.find((e) => e.id === textId)
  const note = text?.containerId ? all.find((e) => e.id === text.containerId) : undefined
  if (!text || !note || text.isDeleted || note.isDeleted || !isStickyNote(note as never)) return false
  // Words born in a note wear its ink before their first letter (V-95): Excalidraw makes a note's new words in its own
  // current ink, whatever the note's colour. The ink comes from the note's skeleton, as every note's words get theirs.
  // Words that have letters keep the colour they have: one chosen for them is the person's.
  if (!(text.originalText ?? text.text)) {
    const { strokeColor } = noteSkeleton({ id: note.id, x: note.x, y: note.y, text: "", colour: noteColourOf(note) ?? "yellow" }).label
    if (text.strokeColor === strokeColor || !fitMayWrite(text)) return false
    api.updateScene({ elements: all.map((e) => (e.id === text.id ? bumped(e, { strokeColor }) : e)) as never, captureUpdate: capture })
    return true
  }
  const size = noteSizeOf(note.width)
  if (NOTE_SIZES[size] !== note.width) return false
  fitWhenFaceLands(api, convert, text)
  const sk = noteSkeleton({ id: note.id, x: note.x, y: note.y, text: text.originalText ?? text.text ?? "", colour: noteColourOf(note) ?? "yellow", size })
  // The words' own font and alignment (Excalidraw's align keys work on a note's words too).
  if (text.fontFamily) sk.label.fontFamily = text.fontFamily
  if (typeof text.textAlign === "string") sk.label.textAlign = text.textAlign
  if (typeof text.verticalAlign === "string") sk.label.verticalAlign = text.verticalAlign
  const [rect, laid] = fittedNote(convert, sk)
  if (!laid) return false
  const words: Partial<SceneElement> = { fontSize: laid.fontSize, text: laid.text, x: laid.x, y: laid.y, width: laid.width, height: laid.height }
  if (note.height === rect.height && Object.entries(words).every(([k, v]) => text[k] === v)) return false
  if (!fitMayWrite(text)) return false
  // This works around an internal of Excalidraw 0.18.1: textWysiwyg's updateWysiwygStyle keeps
  // originalContainerCache[containerId] (element/containerCache, not exported) and re-reads it only when
  // textPropertiesUpdated (the words' fontSize or fontFamily differs from the editor's). If an upgrade changes it,
  // boardOps.test's version check and the V-104 leg in e2e/boardFirstMinutes fail red.
  // Excalidraw's editor keeps a note's height from the first time its words were edited, by the note's id, as the floor
  // it shrinks the note back to while the words are short, and re-reads it only when the words' size changes. A note
  // sized since (Alt+N, the bar) is taller than that floor: raised back while its words are open, the editor would
  // shrink it again, and the two would write each other without end (V-104, React #185). So a note raised while its
  // words are open is first written with its words a hair off their size, which has the editor take the note's height
  // as its floor (the editor reads each write at once), then as fitted below: both in one task, before a frame is drawn.
  if (rect.height > (note.height ?? 0) && api.getAppState().editingTextElement?.id === text.id) {
    api.updateScene({
      elements: all.map((e) => (e.id === note.id ? bumped(e, { height: rect.height }) : e.id === text.id ? bumped(e, { ...words, fontSize: Number(laid.fontSize) + FLOOR_NUDGE }) : e)) as never,
      captureUpdate: capture,
    })
    const now = scene(api)
    api.updateScene({
      elements: now.map((e) => (e.id === note.id ? bumped(e, { height: rect.height }) : e.id === text.id ? bumped(e, words) : e)) as never,
      captureUpdate: capture,
    })
    return true
  }
  api.updateScene({
    elements: all.map((e) => (e.id === note.id ? bumped(e, { height: rect.height }) : e.id === text.id ? bumped(e, words) : e)) as never,
    captureUpdate: capture,
  })
  return true
}

/** The shape an element goes with: a shape's bound words go where it goes, into its frame too. */
const carrierOf = (el: SceneElement): string => (el.type === "text" && el.containerId ? el.containerId : el.id)

/**
 * Moves shapes to new top-left corners (and resizes frames), carrying each
 * shape's bound words with it, as one undo step. `frames` also puts each moved
 * shape (and its words) in a frame; `add` and `select` join the same step.
 */
export function moveElements(
  api: Api,
  moves: ReadonlyMap<string, { x: number; y: number }>,
  o: { sizes?: ReadonlyMap<string, { width: number; height: number }>; frames?: ReadonlyMap<string, string>; add?: readonly SceneElement[]; select?: readonly string[] } = {},
): number {
  const delta = new Map<string, { dx: number; dy: number }>()
  for (const el of scene(api)) {
    const to = moves.get(el.id)
    if (to && !el.isDeleted) delta.set(el.id, { dx: to.x - el.x, dy: to.y - el.y })
  }
  return changeElements(
    api,
    (el) => {
      const size = o.sizes?.get(el.id)
      const id = delta.has(el.id) || size ? el.id : carrierOf(el)
      const d = delta.get(id)
      const frameId = d ? o.frames?.get(id) : undefined
      if (!d && !size) return null
      return { ...(d ? { x: el.x + d.dx, y: el.y + d.dy } : {}), ...(size ?? {}), ...(frameId ? { frameId } : {}) }
    },
    { add: o.add, select: o.select },
  )
}

/**
 * A cluster's frames (miro-07 5), as one undo step: each frame added with its
 * group's name, and each note moved to its place in its frame, its words with
 * it (lib/board/sticky's clusterLayout says where). The new frames end
 * selected, so the frame bar's Make tasks and layouts are one press away.
 * Returns the frames' ids, in order.
 */
export function clusterIntoFrames(
  api: Api,
  frames: readonly { x: number; y: number; width: number; height: number; name: string }[],
  places: ReadonlyMap<string, { x: number; y: number; frame: number }>,
): string[] {
  const made = frames.map((f) => frameElement({ id: newElementId("frame"), x: f.x, y: f.y, width: f.width, height: f.height, name: f.name }))
  const live = new Set(scene(api).filter((el) => !el.isDeleted).map((el) => el.id))
  const moves = new Map<string, { x: number; y: number }>()
  const into = new Map<string, string>()
  for (const [id, p] of places) {
    if (!live.has(id) || !made[p.frame]) continue
    moves.set(id, p)
    into.set(id, made[p.frame].id)
  }
  if (moves.size === 0) return []
  moveElements(api, moves, { frames: into, add: made, select: made.map((f) => f.id) })
  return made.map((f) => f.id)
}

/** Puts elements in a frame (or takes them out, with null), with their bound words. */
export function setFrame(api: Api, ids: ReadonlySet<string>, frameId: string | null): number {
  return changeElements(api, (el) => (ids.has(carrierOf(el)) || ids.has(el.id)) && el.frameId !== frameId ? { frameId } : null)
}

/**
 * Selects elements and starts typing in the first one's words, as Excalidraw
 * does for Enter on a selected shape (its own keyboard handler, so the editor
 * it opens is its own). Waits two frames for the selection to land.
 */
export function selectAndEdit(api: Api, ids: string[], container: Element | null, edit = true): void {
  api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } as never })
  if (!edit || !container) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    }),
  )
}

/** The middle of what the person is looking at, in scene coordinates. */
export function viewMiddle(api: Pick<ExcalidrawImperativeAPI, "getAppState">): { x: number; y: number } {
  const s = api.getAppState()
  return { x: -s.scrollX + s.width / 2 / s.zoom.value, y: -s.scrollY + s.height / 2 / s.zoom.value }
}
