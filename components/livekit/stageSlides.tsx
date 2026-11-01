"use client"

/**
 * Slides control on a call's stage (meet-14, as Meet's slide controls and
 * Zoom's slide control): the board's frames are the deck (lib/calls/slides),
 * and whoever may take the board down may move it through them for everyone
 * (the server's one rule for both, CallControl movesStage: boardControls'
 * stop). The room's metadata names the slide (board.slide), and everyone's
 * camera follows it (useStageSlide), guests' too; between moves each person
 * pans and zooms as they like.
 *
 * The bar: for a mover, Previous, the slide (a list of every slide and the
 * whole board) and Next, with PageUp and PageDown from anywhere but a field
 * (a presenter's clicker sends those) and the arrow keys on the board while
 * nothing on it is selected (Excalidraw nudges a selection with them). For
 * everyone else, "Slide 3 of 8", which shows the slide again after a pan.
 * Loaded with the stage, so no call route's first load carries it.
 */

import * as React from "react"
import type * as Y from "yjs"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { notForTheBoard } from "@/components/board/boardKeys"
import { holdFrame, type FrameHold } from "@/components/board/presentFrame"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSceneElements } from "@/hooks/useSceneElements"
import { frameDrawing } from "@/lib/board/camera"
import { frameOrderOf } from "@/lib/board/frames"
import { deckOf, slidePlace, stepSlide, type SceneFrame, type Slide } from "@/lib/calls/slides"
import { ChevronDown, ChevronLeft, ChevronRight } from "@/lib/icons"
import type { CallAct } from "./callHosting"
import { CALL_SURFACE, STAGE_OVERLAY } from "./callSurface"

/** What the stage's camera uses of Excalidraw's API (a test passes a stand-in). */
export type SlideCamera = Pick<ExcalidrawImperativeAPI, "getSceneElements" | "onChange" | "scrollToContent" | "getAppState">
/** What the bar reads of it: the scene, and whether anything on it is selected. */
export type SlideScene = Pick<ExcalidrawImperativeAPI, "getSceneElements" | "onChange" | "getAppState">
/** The call's pills on the board (CallBoardStage's and CallGuestBoardStage's bar): a slide keeps clear of them while they float over the canvas. */
const PILLS = "[data-board-bar]"

/**
 * The stage's camera follows the room's slide: it shows the slide's frame
 * filling the stage, clear of what's drawn over the canvas (presentFrame),
 * when the slide changes, and when the frame first reaches the scene (someone
 * who joins gets the room's slide before the board's drawing). Back on the
 * whole board after a slide, it frames the drawing once; on a board that
 * opens on the whole board, the canvas keeps its own first camera. Drawing
 * never moves it. A slide that isn't on the board frames the drawing on a
 * first visit, so nobody lands on empty canvas, and is shown if its frame
 * turns up. The slide stays filling the stage as the stage's room changes
 * (the presenter's slides join the row above a phone's canvas and it wraps, a
 * phone turns), until a person moves the camera (holdFrame). `stage` is the
 * board's frame on the stage: the slide's room is measured in it, and it gets
 * data-slide-placed, the slide the camera was put on (for e2e). Returns a
 * function that shows the slide again.
 */
export function useStageSlide(api: SlideCamera | null, board: string, slide: string, stage?: React.RefObject<HTMLElement | null>): () => void {
  // Where the camera was put last on this board: a slide, "" the whole board, or nowhere yet.
  const placed = React.useRef<{ board: string; slide: string } | null>(null)
  // The slide the camera was put on, held in its room as the room changes.
  const hold = React.useRef<FrameHold | null>(null)
  React.useEffect(() => {
    if (!api) return
    const held = holdFrame(api, stage?.current, PILLS)
    hold.current = held
    return () => {
      held.stop()
      hold.current = null
    }
  }, [api, stage])
  React.useEffect(() => {
    const was = placed.current?.board === board ? placed.current.slide : null
    if (!api || slide === was) return
    hold.current?.drop()
    const put = (to: string) => {
      placed.current = { board, slide: to }
      if (stage?.current) stage.current.dataset.slidePlaced = to
    }
    if (!slide) {
      if (was !== null) api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: true })
      put("")
      return
    }
    const first = was === null
    let framed = false
    let seen: readonly unknown[] | null = null
    const place = (): boolean => {
      const elements = api.getSceneElements()
      // Excalidraw hands the same array until the scene changes: a pan reads nothing.
      if (elements === seen) return false
      seen = elements
      if (elements.some((e) => e.id === slide)) {
        hold.current?.show(slide, !first)
        put(slide)
        return true
      }
      if (first && !framed && elements.length > 0) framed = frameDrawing(api)
      return false
    }
    if (place()) return
    const stop = api.onChange(() => {
      if (place()) stop()
    })
    return stop
  }, [api, board, slide, stage])
  return React.useCallback(() => {
    if (slide) hold.current?.show(slide, true)
  }, [slide])
}

/** The frames' order the board keeps (the Frames panel's), live for everyone; null when none is kept. */
function useFrameOrder(doc: Y.Doc | undefined): string[] | null {
  const [order, setOrder] = React.useState<string[] | null>(null)
  React.useEffect(() => {
    if (!doc) return
    const meta = doc.getMap<unknown>("boardMeta")
    const read = () => setOrder(frameOrderOf(meta))
    read()
    meta.observe(read)
    return () => meta.unobserve(read)
  }, [doc])
  return order
}

/**
 * Moves the slide for everyone: one ask in flight, the newest press winning
 * (a clicker's quick presses go as one move, to where they ended). Steps
 * count from the slide asked for until the room's metadata says which is up;
 * a refusal is said by act, and steps count from the room's slide again.
 */
function useSlideMoves(act: CallAct, slide: string) {
  const asked = React.useRef<string | null>(null)
  const sending = React.useRef(false)
  React.useEffect(() => {
    if (!sending.current) asked.current = null
  }, [slide])
  const go = React.useCallback(
    async (to: string) => {
      asked.current = to
      if (sending.current) return
      sending.current = true
      try {
        let sent: string | null = null
        while (asked.current !== null && asked.current !== sent) {
          sent = asked.current
          if (!(await act("board_slide", { slide: sent }))) asked.current = null
        }
      } finally {
        sending.current = false
      }
    },
    [act],
  )
  const from = React.useCallback(() => asked.current ?? slide, [slide])
  return { go, from }
}

/** PageUp and PageDown from anywhere but a field, a dialog or a menu; the arrows on the board while nothing on it is selected. */
function useSlideKeys(api: SlideScene, stage: React.RefObject<HTMLElement | null>, step: (by: 1 | -1) => void) {
  React.useEffect(() => {
    const onTheBoard = (e: KeyboardEvent) => {
      const t = e.target
      const here = t === document.body || (t instanceof Node && !!stage.current?.contains(t))
      return here && !Object.values(api.getAppState().selectedElementIds).some(Boolean)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || notForTheBoard(e)) return
      const by = e.key === "PageDown" || (e.key === "ArrowRight" && onTheBoard(e)) ? 1 : e.key === "PageUp" || (e.key === "ArrowLeft" && onTheBoard(e)) ? -1 : 0
      if (!by) return
      // Before Excalidraw, which scrolls the canvas on PageUp and PageDown.
      e.preventDefault()
      e.stopPropagation()
      step(by)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [api, stage, step])
}

const ARROW = `${STAGE_OVERLAY} grid size-8 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4`
/** Never a slide's id (lib/calls/slideId SLIDE_ID): the list's row for the whole board. */
const WHOLE = "*"

function SlideMover({ api, deck, slide, act, stage, refit }: { api: SlideScene; deck: readonly Slide[]; slide: string; act: CallAct; stage: React.RefObject<HTMLElement | null>; refit: () => void }) {
  const { go, from } = useSlideMoves(act, slide)
  // The deck is read when a key is pressed: drawing changes it, and the keys stay bound.
  const deckNow = React.useRef(deck)
  React.useEffect(() => {
    deckNow.current = deck
  }, [deck])
  const step = React.useCallback(
    (by: 1 | -1) => {
      const to = stepSlide(deckNow.current, from(), by)
      if (to !== null) void go(to)
    },
    [from, go],
  )
  useSlideKeys(api, stage, step)
  const place = slidePlace(deck, slide)
  // Picking the room's slide shows it again (after a pan); any other goes to everyone, Whole board too
  // while the room is on a slide that's no longer on the board.
  const pick = (to: string) => (to === slide ? refit() : void go(to))
  return (
    <div role="group" aria-label="Slides" data-touch-group="32" className="flex shrink-0 items-center gap-1">
      <button type="button" data-touch-target className={ARROW} aria-label="Previous slide" disabled={stepSlide(deck, slide, -1) === null} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-touch-target className={`${STAGE_OVERLAY} flex h-8 min-w-0 max-w-[26ch] items-center gap-1.5 px-2.5 text-ui-sm tabular-nums focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-4 [&_svg]:shrink-0`}>
            <span className="truncate">{place ? `${place.at} of ${place.of}${place.name ? ` · ${place.name}` : ""}` : "Whole board"}</span>
            <ChevronDown aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={`${CALL_SURFACE} max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto`}>
          <DropdownMenuLabel className="text-meta font-normal text-ink-3">Show everyone</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={place ? slide : WHOLE}>
            <DropdownMenuRadioItem value={WHOLE} onSelect={() => pick("")}>
              Whole board
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {deck.map((s, i) => (
              <DropdownMenuRadioItem key={s.id} value={s.id} onSelect={() => pick(s.id)} className="gap-2">
                <span className="w-5 shrink-0 text-right tabular-nums text-ink-3">{i + 1}</span>
                <span className="truncate">{s.name || "Untitled frame"}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" data-touch-target className={ARROW} aria-label="Next slide" disabled={stepSlide(deck, slide, 1) === null} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}

/**
 * The stage's slides: the mover's bar, or everyone else's "Slide 3 of 8"
 * (none on the whole board), and the slide said to a screen reader as it
 * moves. Nothing while the board has no frames.
 */
export function StageSlides({
  api,
  doc,
  slide,
  moves,
  act,
  refit,
  stage,
}: {
  api: SlideScene
  /** The board's document, for the frames' kept order. */
  doc: Y.Doc | undefined
  slide: string
  /** They may move the slides (boardControls' stop); a guest never may. */
  moves: boolean
  act?: CallAct
  /** Shows the slide again (useStageSlide). */
  refit: () => void
  /** The stage's frame: the arrow keys move slides from inside it. */
  stage: React.RefObject<HTMLElement | null>
}) {
  const elements = useSceneElements<SceneFrame>(api)
  const order = useFrameOrder(doc)
  const deck = React.useMemo(() => deckOf(elements, order), [elements, order])
  if (deck.length === 0) return null
  const place = slidePlace(deck, slide)
  const said = place ? `Slide ${place.at} of ${place.of}${place.name ? `, ${place.name}` : ""}` : ""
  return (
    <>
      {moves && act ? (
        <SlideMover api={api} deck={deck} slide={slide} act={act} stage={stage} refit={refit} />
      ) : place ? (
        <button
          type="button"
          data-touch-target
          className={`${STAGE_OVERLAY} pointer-events-auto flex h-8 shrink-0 items-center px-2.5 text-ui-sm tabular-nums focus-visible:outline-2 focus-visible:outline-brand`}
          aria-label={`${said}: show it again`}
          onClick={refit}
        >
          Slide {place.at} of {place.of}
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  )
}
