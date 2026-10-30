"use client"

// Tags on the notes themselves (miro-07 5): a tagged note shows its tags as
// small chips along its foot, each in its tag's colour, as Miro's stickies
// show theirs, for everyone who can see the board. An overlay over the
// canvas, never part of the drawing, so a copy, an export or an undo never
// meets it. Drawn only for the notes in view, and only while the board is
// near enough (half size or closer) for a chip to sit inside its note.
// Layered at z-2: over both canvases (it comes after them in the page),
// under the live cursors (z-3) and every panel, menu and bar of Excalidraw's
// (its UI layer, z-4) and the board's own.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useBoardView } from "@/hooks/useBoardView"
import { useSceneElements } from "@/hooks/useSceneElements"
import { useElementsChanged } from "@/hooks/useElementsChanged"
import { Chip } from "@/components/ui/chip"
import { cn } from "@/lib/utils/helpers/cn"
import { chipWidth } from "@/components/ui/chipBox"
import { itemsThatFit } from "@/lib/rowFit"
import { boxInView, sceneToLocal, type BoardView } from "@/lib/board/viewport"
import { isStickyNote } from "@/lib/board/notes"
import { hasAnyTag, noteTags, tagKeys } from "@/lib/board/sticky"
import type { SceneElement } from "@/components/board/boardOps"
import type { TagHues } from "@/components/board/tagHues"

/** Below this zoom a chip would crowd its note: the chips step back until the board is nearer. */
export const TAG_CHIPS_MIN_ZOOM = 0.5
/** At most this many chips on a note, and only those that fit whole; the rest are counted ("+2"). */
const MOST = 3
/** The chips' row: the note's width less its sides (inset-x-1.5), and the gap between chips (gap-1). */
const ROW_SIDES = 12
const ROW_GAP = 4
/**
 * What a note can't show (its count, a tag cut short) is named in the app's
 * label (data-tip) to a mouse that rests on it. A finger passes through to the
 * note, whose notes bar lists its tags.
 */
const NAMED = "pointer-fine:pointer-events-auto"
/** Nothing selected: one array for every render, so the notes the chips walk are worked out again only when the selection changes. */
const NO_IDS: readonly string[] = []

/** A note's box on the canvas at this view, and whether any of it is in view. */
function noteBox(view: BoardView, n: SceneElement) {
  const at = sceneToLocal(view, n.x, n.y)
  const width = n.width * view.zoom
  const height = n.height * view.zoom
  return { left: at.left, top: at.top, width, height, inView: boxInView(view, at.left, at.top, at.left + width, at.top + height) }
}

export function NoteTagChips({
  api,
  tagHues,
  filter = [],
  selected = NO_IDS,
}: {
  api: ExcalidrawImperativeAPI
  tagHues: TagHues
  filter?: readonly string[]
  /** Every selected element, by id (the workbench's BoardSelection.ids): what a drag carries. */
  selected?: readonly string[]
}) {
  // Read again only when the board changes (a tag, a move), never per frame of a pan.
  const all = useSceneElements<SceneElement>(api)
  const tagged = React.useMemo(() => all.filter((e) => isStickyNote(e as never) && noteTags(e).length > 0), [all])
  // Excalidraw moves, sizes and turns a note in place, frame by frame, and keeps its array until the move ends: the
  // chips are the note's face, so they're drawn again with every change to a tagged note, a drag's every frame
  // included, and never for any other element (miro-06).
  const taggedIds = React.useMemo(() => tagged.map((n) => n.id), [tagged])
  useElementsChanged(api, taggedIds, { duringMoves: true })
  // No tagged note, no work: the view isn't followed at all.
  const view = useBoardView(api, tagged.length > 0)
  // The notes a drag's frame draws chips for: those in view as the view rests, and those the selection carries, which
  // a drag may bring into view: a selected note, and a note in a selected frame (Excalidraw drags a frame's elements
  // with it). A drag moves notes in place and changes none of these, so its every frame walks these few, never every
  // tagged note on the board (miro-06's paired A/B). None while the board is too far away for chips.
  const carried = React.useMemo(() => new Set(selected), [selected])
  const near = React.useMemo(
    () =>
      view && view.zoom >= TAG_CHIPS_MIN_ZOOM
        ? tagged.filter((n) => carried.has(n.id) || (n.frameId != null && carried.has(n.frameId)) || noteBox(view, n).inView)
        : [],
    [tagged, view, carried],
  )
  // The page's font, read once: the chips' words are measured in it to know which fit whole.
  const family = React.useMemo(() => (typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily || "sans-serif"), [])
  // A filter by tag (components/board/tagFilter) fades a note it leaves out: its chips fade with it.
  const wanted = React.useMemo(() => tagKeys(filter), [filter])
  if (!view || tagged.length === 0 || view.zoom < TAG_CHIPS_MIN_ZOOM) return null
  return (
    <div aria-hidden="true" data-note-tags="" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {near.map((n) => {
        const { left, top, width, height, inView } = noteBox(view, n)
        if (!inView) return null
        const tags = noteTags(n)
        const faded = wanted.size > 0 && !hasAnyTag(tags, wanted)
        // Whole chips while they fit (a narrow note or a far view shows fewer), the rest counted; a first tag too
        // long for the note is cut short.
        const whole = itemsThatFit(
          tags.map((t) => chipWidth(t, family, true)),
          width - ROW_SIDES,
          (left) => chipWidth(`+${left}`, family),
          ROW_GAP,
          MOST,
        )
        const shown = Math.max(whole, 1)
        const angle = typeof n.angle === "number" ? n.angle : 0
        return (
          // The note's own box, turned as the note is, so the chips sit at its foot however it's turned.
          <div
            key={n.id}
            data-note-tags-of={n.id}
            data-faded={faded || undefined}
            className={cn("absolute", faded && "opacity-25")}
            style={{ left, top, width, height, transform: angle ? `rotate(${angle}rad)` : undefined }}
          >
            <div className="absolute inset-x-1.5 bottom-1.5 flex items-end gap-1 overflow-hidden">
              {tags.slice(0, shown).map((t) => (
                // A tag as every tag is drawn (components/ui/chip): a calm chip, its colour a dot.
                <span key={t} data-tag={t} data-hue={tagHues.hueOf(t)} data-tip={whole ? undefined : t} className={cn("flex min-w-0", !whole && NAMED)}>
                  <Chip dot={tagHues.hueOf(t)} className="bg-pop">
                    {t}
                  </Chip>
                </span>
              ))}
              {tags.length > shown && (
                <span data-tag-rest="" data-tip={tags.slice(shown).join(", ")} className={cn("flex shrink-0", NAMED)}>
                  <Chip className="bg-pop">+{tags.length - shown}</Chip>
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
