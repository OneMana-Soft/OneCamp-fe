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

/** The CSS font an element's words are drawn in: its size, and Excalidraw's face for its font id (known after loadConvert). */
export function fontCss(el: { fontSize?: unknown; fontFamily?: unknown }): string {
  const name = typeof el.fontFamily === "number" ? faceNames.get(el.fontFamily) : undefined
  return `${Number(el.fontSize ?? 20)}px ${name ? `"${name}", ` : ""}sans-serif`
}

/**
 * The face a note's words were laid out in, stamped on them as they're laid out (V-229; main, 1 Nov 18:4x): the face's
 * name and their size when it was here, so the layout was measured in it, or FALLBACK when it wasn't, so the browser
 * measured them in another face. Screens measure one face otherwise (Chromium and WebKit by up to 22 px), so words
 * stamped as laid out in their face are never laid out again for measuring otherwise; words stamped FALLBACK, with no
 * stamp (laid out before stamps), or with one for a face or size they've since left, are fitted again once it has come.
 */
const LAID_IN = "laidIn"
const FALLBACK = "fallback"

type Words = Pick<SceneElement, "fontFamily" | "text" | "originalText" | "customData"> & { fontSize?: unknown }

/** The stamp of words laid out in their own face as they are now: its name and their size (null before loadConvert names faces). */
function inFaceStamp(t: Words): string | null {
  const name = typeof t.fontFamily === "number" ? faceNames.get(t.fontFamily) : undefined
  return name ? `${name} ${Number(t.fontSize ?? 16)}px` : null
}

/** Whether the words' own face is here (the font set has it for them); undefined with no font set or no name for the face. */
function faceHere(t: Words): boolean | undefined {
  const fonts = typeof document === "undefined" ? undefined : document.fonts
  const name = typeof t.fontFamily === "number" ? faceNames.get(t.fontFamily) : undefined
  if (!fonts || !name) return undefined
  return fonts.check(`${Number(t.fontSize ?? 16)}px "${name}"`, t.originalText ?? t.text ?? "")
}

/**
 * What `words` take to carry the stamp of a layout made now as `laid` (their face, at the size it laid them out at):
 * their customData with it, keeping what else it says; nothing when they carry it already, or no font set can say.
 */
function stampOf(words: Words, laid: Words = words): Partial<SceneElement> {
  const here = faceHere(laid)
  const stamp = here === undefined ? null : here ? inFaceStamp(laid) : FALLBACK
  return stamp === null || words.customData?.[LAID_IN] === stamp ? {} : { customData: { ...(words.customData ?? {}), [LAID_IN]: stamp } }
}

/** Elements Excalidraw's converter has just laid out, the words bound in them stamped with the face they were laid out in (V-229). */
export function stampLaidOut<T extends SceneElement>(elements: T[]): T[] {
  return elements.map((e) => (e.type === "text" && e.containerId ? { ...e, ...stampOf(e as Words) } : e))
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
  return stampLaidOut(lay(sk.id, fontSize))
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
 * The skeleton a note of its size lays `words` out from, in the words' own font and alignment (Excalidraw's align keys
 * work on a note's words too). Null for a note not at one of the sizes (one resized by hand), whose words are a shape's.
 */
function skeletonOf(note: SceneElement, text: SceneElement, words: string): NoteSkeleton | null {
  const size = noteSizeOf(note.width)
  if (NOTE_SIZES[size] !== note.width) return null
  const sk = noteSkeleton({ id: note.id, x: note.x, y: note.y, text: words, colour: noteColourOf(note) ?? "yellow", size })
  if (text.fontFamily) sk.label.fontFamily = text.fontFamily
  if (typeof text.textAlign === "string") sk.label.textAlign = text.textAlign
  if (typeof text.verticalAlign === "string") sk.label.verticalAlign = text.verticalAlign
  return sk
}

/** A note's rectangle and words laid out for `words`, as a note of its size lays them out (fittedNote); null as skeletonOf. */
function noteFit(convert: Convert, note: SceneElement, text: SceneElement, words: string): [SceneElement, SceneElement] | null {
  const sk = skeletonOf(note, text, words)
  if (!sk) return null
  const [rect, laid] = fittedNote(convert, sk)
  return laid ? [rect, laid] : null
}

/** What fitting the note holding `text` writes: the note's height and its words' size and layout; null when it has them, or isn't at one of its sizes. */
function refitOf(convert: Convert, note: SceneElement, text: SceneElement): { height: number; words: Partial<SceneElement> } | null {
  const fit = noteFit(convert, note, text, text.originalText ?? text.text ?? "")
  if (!fit) return null
  const [rect, laid] = fit
  const words: Partial<SceneElement> = { fontSize: laid.fontSize, text: laid.text, x: laid.x, y: laid.y, width: laid.width, height: laid.height }
  // The face the words are laid out in now goes with them (V-229): once, as a stamp they lack is written.
  const stamp = stampOf(text, laid)
  if (note.height === rect.height && !stamp.customData && Object.entries(words).every(([k, v]) => text[k] === v)) return null
  return { height: rect.height, words: { ...words, ...stamp } }
}

/**
 * Keeps the note whose words are being typed its own size (miro-07): as the words grow they come down to the
 * largest size, to the floor, at which they fit it, and they go back up as the words shrink; past the floor the
 * note grows, as Excalidraw grows it. Only a note at one of its three sizes: one sized by hand keeps Excalidraw's
 * own ways. The words keep their element and its id, since the editor is bound to it; only their size and layout
 * change, laid out as fittedNote lays them. It joins the typing's own undo step (EVENTUALLY), and writes only on a
 * change; the refit made when the words' face lands writes NEVER (fitNotesToFaces). Returns whether it changed anything.
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
  const fit = refitOf(convert, note, text)
  if (!fit || !fitMayWrite(text)) return false
  const { height, words } = fit
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
  if (height > (note.height ?? 0) && api.getAppState().editingTextElement?.id === text.id) {
    api.updateScene({
      elements: all.map((e) => (e.id === note.id ? bumped(e, { height }) : e.id === text.id ? bumped(e, { ...words, fontSize: Number(words.fontSize) + FLOOR_NUDGE }) : e)) as never,
      captureUpdate: capture,
    })
    const now = scene(api)
    api.updateScene({
      elements: now.map((e) => (e.id === note.id ? bumped(e, { height }) : e.id === text.id ? bumped(e, words) : e)) as never,
      captureUpdate: capture,
    })
    return true
  }
  api.updateScene({
    elements: all.map((e) => (e.id === note.id ? bumped(e, { height }) : e.id === text.id ? bumped(e, words) : e)) as never,
    captureUpdate: capture,
  })
  return true
}

/** How far a note's words may be from as wide as their face lays them, in px, and still be laid out in it: a screen's own measuring. */
const FACE_SLACK = 1

/**
 * Whether a note's words with no stamp to say (laid out before stamps, or since put in another face or size by something
 * that didn't stamp them) were laid out in a face that isn't the one they're drawn in (V-229): laid out again at their
 * own size, now that their face is here, their lines or their width come out otherwise. Words laid out in their face,
 * at whatever size (a note from before miro-07 too), are not. On another screen, measuring the face otherwise, they may
 * be: such words are laid out again there once, and stamped, so no screen lays them out again.
 */
function laidInAnotherFace(convert: Convert, note: SceneElement, text: SceneElement): boolean {
  const sk = skeletonOf(note, text, text.originalText ?? text.text ?? "")
  if (!sk) return false
  const trial = { ...sk, id: TRIAL_ID, label: { ...sk.label, fontSize: Number(text.fontSize) } }
  const laid = (convert([trial] as never, { regenerateIds: false }) as unknown as SceneElement[])[1]
  return !!laid && (laid.text !== text.text || Math.abs(Number(laid.width) - Number(text.width)) > FACE_SLACK)
}

/**
 * Fits again, in their face, the notes on the board whose words were laid out in another (miro-07, V-229): before their
 * face had come, on this screen (a new note, a size, typing, a template on a phone's first board) or on any screen
 * before (a board saved with the fallback face's widths). When a face lands Excalidraw only draws the words again in it
 * (its Fonts.onLoaded keeps their line breaks and size), inside the widths the fallback face gave them, and cuts the
 * lines that no longer fit. Only notes whose face has come are looked at; the rest wait for theirs, and
 * useNotesFitTheirFaces runs this again as each face lands. A face that can't come leaves the fallback face's fit,
 * which is the face the words are drawn in.
 *
 * Which words were laid out in another face is their stamp's to say (stampOf; main, 1 Nov 18:4x), as screens measure one
 * face otherwise: words stamped as laid out in their face are never written, whatever this screen measures; those
 * stamped FALLBACK are fitted and stamped; those with no stamp are measured (laidInAnotherFace). Words already right in
 * their face are never written, but for the stamp a FALLBACK layout gives way to. Every fit is written at once, as a correction of the layout
 * and not a step of the person's: NEVER, as Excalidraw writes a remote change, so no undo step carries it, and every
 * screen gets it as any edit. Words being typed go through fitTypedNote, which keeps the editor and the note agreed
 * (V-104), and lose nothing: while an element has a change of the person's in hand, Excalidraw's updateScene keeps its
 * last committed copy. `seen` keeps the words found right, by version, so a later pass skips them. Returns how many
 * notes it fitted.
 */
export function fitNotesToFaces(api: Api, convert: Convert, seen: Set<string> = new Set()): number {
  const fonts = typeof document === "undefined" ? undefined : document.fonts
  if (!fonts) return 0
  const all = scene(api)
  const byId = new Map(all.map((e) => [e.id, e]))
  const editing = api.getAppState().editingTextElement?.id
  const fits = new Map<string, Partial<SceneElement>>()
  let typed: string | undefined
  let fitted = 0
  for (const note of all) {
    if (note.isDeleted || !isStickyNote(note as never)) continue
    const text = boundText(byId, note)
    const words = text?.originalText ?? text?.text ?? ""
    const name = text && typeof text.fontFamily === "number" ? faceNames.get(text.fontFamily) : undefined
    if (!text || text.isDeleted || !name || !words.trim() || seen.has(`${text.id}:${text.version}`)) continue
    if (!fonts.check(`${text.fontSize ?? 16}px "${name}"`, words)) continue
    // Stamped as laid out in this face at this size, on any screen: never laid out again for measuring otherwise here.
    // Stamped FALLBACK: laid out before it came, so fitted now. With no stamp, or one for a face or size they've since
    // left: fitted only when, laid out again here at their own size, their lines or width come out otherwise.
    const stamp = text.customData?.[LAID_IN]
    const fit = stamp === inFaceStamp(text) ? null : stamp === FALLBACK || laidInAnotherFace(convert, note, text) ? refitOf(convert, note, text) : null
    if (!fit) seen.add(`${text.id}:${text.version}`)
    else if (text.id === editing) typed = text.id
    else if (fitMayWrite(text)) {
      fits.set(note.id, { height: fit.height })
      fits.set(text.id, fit.words)
      fitted++
    }
  }
  if (fits.size > 0) {
    api.updateScene({ elements: all.map((e) => (fits.has(e.id) ? bumped(e, fits.get(e.id) as Partial<SceneElement>) : e)) as never, captureUpdate: CAPTURE.NEVER })
  }
  if (typed !== undefined && fitTypedNote(api, convert, typed, CAPTURE.NEVER)) fitted++
  return fitted
}

/** Excalidraw 0.18.1's room around a shape's words, and an arrow label's width (getBoundTextMaxWidth). */
const WORDS_PADDING = 5
const ARROW_LABEL_SHARE = 0.7
const ARROW_LABEL_MIN_EMS = 11

/** A text element's font and alignment, as a skeleton's words take them (only those it has). */
const fontOf = (text: SceneElement): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({ fontSize: text.fontSize, fontFamily: text.fontFamily, lineHeight: text.lineHeight, textAlign: text.textAlign, verticalAlign: text.verticalAlign }).filter(([, v]) => v !== undefined),
  )

/** The layout of `words` in a text element's own font, from the converter: the words wrapped at `wrapAt` when given. */
function layOut(convert: Convert, text: SceneElement, words: string, wrapAt: number | null): SceneElement {
  const font = fontOf(text)
  if (wrapAt === null) return (convert([{ type: "text", x: 0, y: 0, text: words, ...font }] as never, { regenerateIds: false }) as unknown as SceneElement[])[0]
  // Wrapped as a shape's words wrap: in a rectangle as wide as the words may be, and the room around them.
  const sk = { type: "rectangle", id: "reword-trial", x: 0, y: 0, width: wrapAt + WORDS_PADDING * 2, height: 1, label: { text: words, ...font } }
  return (convert([sk] as never, { regenerateIds: false }) as unknown as SceneElement[])[1]
}

/**
 * New words on the board as one undo step of the person's (Find's Replace, miro-05 3), by element: a frame's new name,
 * or a text element's new words as typed. Each is laid out as Excalidraw lays out words typed in its place: a note's
 * fitted to the note (as fitTypedNote fits them), a shape's wrapped in the shape, which grows to hold them, an arrow's
 * label wrapped at the arrow's label width about the label's middle, and words on their own measured from where their
 * alignment holds them (wrapped at their width when it is fixed). Returns how many elements changed.
 */
export function rewordElements(api: Api, convert: Convert, words: ReadonlyMap<string, string>): number {
  const all = scene(api)
  const byId = new Map(all.map((e) => [e.id, e]))
  const patches = new Map<string, Partial<SceneElement>>()
  for (const [id, next] of words) {
    const el = byId.get(id)
    if (!el || el.isDeleted) continue
    if (el.type === "frame" || el.type === "magicframe") {
      if (el.name !== next) patches.set(id, { name: next })
      continue
    }
    if (el.type !== "text" || (el.originalText ?? el.text) === next) continue
    const holder = el.containerId ? byId.get(el.containerId) : undefined
    const fit = holder && isStickyNote(holder as never) ? noteFit(convert, holder, el, next) : null
    if (holder && fit) {
      const [rect, laid] = fit
      patches.set(id, { originalText: next, fontSize: laid.fontSize, text: laid.text, x: laid.x, y: laid.y, width: laid.width, height: laid.height, ...stampOf(el, laid) })
      if (rect.height !== holder.height) patches.set(holder.id, { height: rect.height })
    } else if (holder && holder.type !== "arrow") {
      const [box, laid] = convert(
        [{ type: holder.type, id: holder.id, x: holder.x, y: holder.y, width: holder.width, height: holder.height, label: { text: next, ...fontOf(el) } }] as never,
        { regenerateIds: false },
      ) as unknown as SceneElement[]
      patches.set(id, { originalText: next, text: laid.text, x: laid.x, y: laid.y, width: laid.width, height: laid.height })
      if (box.height !== holder.height) patches.set(holder.id, { height: box.height })
    } else if (holder) {
      const laid = layOut(convert, el, next, Math.max(ARROW_LABEL_SHARE * holder.width, Number(el.fontSize ?? 20) * ARROW_LABEL_MIN_EMS))
      const [cx, cy] = [el.x + el.width / 2, el.y + el.height / 2]
      patches.set(id, { originalText: next, text: laid.text, width: laid.width, height: laid.height, x: cx - laid.width / 2, y: cy - laid.height / 2 })
    } else if (el.autoResize === false) {
      const laid = layOut(convert, el, next, el.width)
      patches.set(id, { originalText: next, text: laid.text, height: laid.height })
    } else {
      const laid = layOut(convert, el, next, null)
      const room = el.width - laid.width
      const x = el.x + (el.textAlign === "center" ? room / 2 : el.textAlign === "right" ? room : 0)
      patches.set(id, { originalText: next, text: laid.text, width: laid.width, height: laid.height, x })
    }
  }
  return patches.size === 0 ? 0 : changeElements(api, (el) => patches.get(el.id) ?? null)
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
