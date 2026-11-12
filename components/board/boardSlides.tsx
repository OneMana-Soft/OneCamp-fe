"use client"

/**
 * A board's frames as slides, outside a call (miro-28, as Miro's presentation
 * mode, and as a call's Slides control moves the board on its stage:
 * components/livekit/stageSlides). The deck is the board's frames in the
 * Frames panel's order (lib/calls/slides through useBoardDeck), live: a frame
 * reordered, renamed, drawn or deleted while presenting moves the deck with it
 * (the slide that's up deleted: the one in its place comes up, and with none
 * left the slides end).
 *
 * Presenting (an editor's Present, components/board/boardFacilitation): the
 * presenter's own view steps through the deck, each frame fitted to the screen
 * clear of the board's bars (presentFrame) and held there as the room changes,
 * on a phone with Excalidraw's own editing chrome stepped away (a follower's too),
 * and the presenting stamp carries the slide, so every follower lands on that
 * frame fitted to theirs (usePresenterFollow). The bar (components/board/
 * slideBar, one with the call's): Previous, the slide, which opens the outline,
 * and Next, with a clicker's PageUp and PageDown and the arrows while nothing
 * is selected; Go to canvas (Miro's) leaves the slide for the canvas while
 * presenting goes on: the presenter roams it, every follower follows their
 * view as plain Present does, and a pinned "Back to slide 2" brings everyone
 * back to that slide, fitted. Esc on a slide or End slides ends the slides
 * where the canvas was before them (End slides from the canvas, where it is),
 * and presenting goes on as before; on the canvas Esc is the canvas's own. A
 * board with no frames presents as it always has, and the outline says how to
 * add one.
 *
 * Following (a viewer, an editor or a share link's guest): "Slide 2 of 3",
 * which opens the outline to see where they are; only the presenter moves it.
 *
 * The outline is the deck as a list (its number, its frame's name) or a grid
 * of tiles, two to a row, each with what its frame holds drawn small (the
 * Frames panel's drawing, frameThumb): one panel with a switch, a side panel
 * on a computer (Esc closes it first), a sheet on a phone with the bar pinned
 * at its foot. A presenter's press, or Enter, jumps; the arrows move between
 * tiles. Nothing here is written anywhere: the slide travels in the
 * presenter's awareness, and on the canvas their stamp has none, so everyone
 * follows their view. A chunk of its own, loaded only once someone presents.
 *
 * Presenter notes (miro-28 2a, components/board/slideNotes): the presenter sees
 * the slide's notes at the outline's foot on a computer, and on a phone in a
 * drawer opened from Notes in the Presenting pill (boardFacilitation's
 * `notesOpen`), so the slide bar keeps its room for the slide's name. They are the presenter's alone (Present
 * is an editor's, and notes are read with the right to present): a follower never
 * asks, and a share link's guest has no `frameNotes` to ask with.
 *
 * Polls on a slide (miro-28 to_win 4, components/board/slidePoll): the presenter's Add a poll in the slide bar starts
 * one on the slide's frame (while the frame has no open poll); the slide's card, for the presenter and everyone
 * following, is a piece of its own, loaded once the frame has a poll, the composer opens, or the polls couldn't be
 * read. It never covers the slide: on a computer a strip at the board's right that the slide's fit leaves; on a phone a
 * bar here in the slides' dock, above the slide bar, which the fit's foot takes. The polls are read here
 * (useSlidePolls): a member's live on the board's topic, a guest's through the app's guest poller.
 */

import * as React from "react"
import type * as Y from "yjs"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useMedia } from "@/context/MediaQueryContext"
import { useSheetMode } from "@/components/ui/overlayMode"
import { BoardSidePanel, SIDE_PANELS } from "@/components/board/boardSidePanel"
import type { SceneElement } from "@/components/board/boardOps"
import { FrameThumb, insideFrames, thumbParts } from "@/components/board/frameThumb"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { useEscapeClosesPanel } from "@/hooks/useEscapeClosesPanel"
import { useSceneElements } from "@/hooks/useSceneElements"
import { BAR_SURFACE } from "@/components/board/facilitationDock"
import { BOARD_SCREEN, holdOnBoard, type FrameHold } from "@/components/board/presentFrame"
import { SlideBar, selectionOn, slideWords, useSlideSteps } from "@/components/board/slideBar"
import { SlidesDock } from "@/components/board/slidesDock"
import { SlideNotes, SlideNotesDrawer } from "@/components/board/slideNotes"
import type { FrameNotesReads, FrameNotesSource } from "@/components/board/frameNotesReads"
import { useBoardDeck } from "@/components/board/useBoardDeck"
import { FIRST_SLIDE } from "@/lib/board/presenting"
import { slidePollOf } from "@/lib/board/boardPolls"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { useSlidePolls, type SlidePollsSource } from "@/components/board/useSlidePolls"
import { slideInPlaceOf, slidePlace, type Slide } from "@/lib/calls/slides"
import { BarChart3, Hand, LayoutGrid, ListOrdered, Presentation, X } from "@/lib/icons"
import { onEscape } from "@/lib/keys/onEscape"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { cn } from "@/lib/utils/helpers/cn"

// A follower's camera on the slide (usePresenterFollow) takes presentFrame through this chunk, which it loads for the
// slide bar anyway: one fetch, and presentFrame is never loaded lazily on its own (lib/lazy/lazyStaticGuard).
export { holdOnBoard }

// A slide's poll card and the presenter's composer: a piece of their own (no shared core), loaded when needed.
const SlidePoll = lazyPiece(() => import("@/components/board/slidePoll"))

/** What the slides use of Excalidraw's API (a test passes a stand-in). */
type SlidesApi = Pick<ExcalidrawImperativeAPI, "getSceneElements" | "onChange" | "getAppState" | "scrollToContent" | "updateScene">

/** Where the camera was before the slides: ending them from a slide returns there. */
type Camera = { scrollX: number; scrollY: number; zoom: number }

/** The board's screen, where the arrow keys move the slides from (slideBar's stage). */
const SCREEN: React.RefObject<HTMLElement | null> = {
  get current() {
    return typeof document === "undefined" ? null : document.querySelector<HTMLElement>(BOARD_SCREEN)
  },
}

const ROW = "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-ui outline-none"

/**
 * While `on` (a slide up on a phone, the presenter's or a follower's), the board is marked (data-slides-on), and
 * Excalidraw's own editing chrome steps away from the slide (excalidrawTheme.css); it comes back when the slides end
 * or the follower stops following (this screen's slides go then).
 */
function useSlidesMark(on: boolean) {
  React.useEffect(() => {
    const board = SCREEN.current
    if (!on || !board) return
    board.dataset.slidesOn = ""
    return () => {
      delete board.dataset.slidesOn
    }
  }, [on])
}

/** Whether anything on the board is selected, live (a phone's selection bar takes the slides' place then). */
function useSelecting(api: SlidesApi, on: boolean) {
  const [selecting, setSelecting] = React.useState(false)
  React.useEffect(() => {
    if (!on) return
    return api.onChange(() => setSelecting(selectionOn(api)))
  }, [api, on])
  return on && selecting
}

/**
 * The presenter's camera on the slide: `slide` fitted and held from the moment it's asked for, let go on the canvas
 * (Go to canvas), and where the canvas was before the first slide kept, for ending the slides from one.
 */
function useSlideCamera(api: SlidesApi, slide: string, on: boolean) {
  const hold = React.useRef<FrameHold | null>(null)
  const before = React.useRef<Camera | null>(null)
  React.useEffect(() => {
    if (!on) return
    const held = holdOnBoard(api)
    hold.current = held
    return () => {
      held.stop()
      hold.current = null
    }
  }, [api, on])
  React.useEffect(() => {
    if (!on) return
    // On the canvas (Go to canvas, or the slides ended): the camera is the presenter's to move.
    if (!slide) return void hold.current?.drop()
    if (slide === FIRST_SLIDE) return
    if (!before.current) {
      const s = api.getAppState()
      before.current = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value }
    }
    hold.current?.show(slide, true)
  }, [api, slide, on])
  /** Lets the camera go: back where it was before the slides when `restore`, else where it is. */
  return React.useCallback(
    (restore: boolean) => {
      hold.current?.drop()
      const b = before.current
      before.current = null
      if (b && restore) api.updateScene({ appState: { scrollX: b.scrollX, scrollY: b.scrollY, zoom: { value: b.zoom } } as never })
    },
    [api],
  )
}

/** A board with no frames: how to add one, in the list and the grid alike (the F key only where there are keys). */
function NoFrames({ editable }: { editable: boolean }) {
  const how = isTouchScreen() ? "Add a frame from the Frames panel: each" : "Add a frame from the Frames panel, or draw one with F: each"
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
      <ListOrdered className="mb-1 size-6 text-ink-3" aria-hidden />
      <p className="text-ui font-medium text-ink">No frames yet</p>
      <p className="text-ui-sm text-ink-3">
        {editable ? how : "Each"} frame presents as a slide, in the Frames panel&apos;s order.
      </p>
    </div>
  )
}

/** The deck as a list: its number and its frame's name, the slide that's up marked; a presenter's rows jump. */
function Outline({ deck, slide, jump }: { deck: readonly Slide[]; slide: string; jump?: (id: string) => void }) {
  return (
    <ol className="grid gap-px" aria-label="Slides, in order">
      {deck.map((s, i) => {
        const up = s.id === slide
        const inner = (
          <>
            <span className="w-5 shrink-0 text-right text-meta tabular-nums text-ink-3">{i + 1}</span>
            <span className={cn("min-w-0 flex-1 truncate", up ? "font-medium text-brand-text" : "text-ink")}>{s.name || "Untitled frame"}</span>
          </>
        )
        return (
          <li key={s.id} data-slide-row={s.id}>
            {jump ? (
              <button
                type="button"
                aria-current={up ? "step" : undefined}
                onClick={() => jump(s.id)}
                className={cn(ROW, "transition-colors focus-visible:ring-2 focus-visible:ring-brand", up ? "bg-brand-muted" : "hover:bg-hover")}
              >
                {inner}
              </button>
            ) : (
              <div aria-current={up ? "step" : undefined} className={cn(ROW, up && "bg-brand-muted")}>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The arrows in the grid, two tiles to a row: across by one, up and down by a row. */
const GRID_STEPS: Record<string, number | undefined> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }

const TILE = "flex w-full flex-col gap-1.5 rounded-lg p-1 text-left outline-none"

/**
 * The deck as a grid of tiles, two to a row (Miro's grid of frames): each slide's number, its frame's name and what it
 * holds drawn small, as the Frames panel's row draws it (frameThumb), the slide that's up tinted as the list's row is
 * (the ring is focus's alone). A presenter's tile jumps on a press or Enter, and the arrows move between tiles (the
 * slides' own arrows leave them to it, data-arrows-own); a follower's grid only shows where the deck is.
 */
function Grid({ api, deck, slide, jump }: { api: SlidesApi; deck: readonly Slide[]; slide: string; jump?: (id: string) => void }) {
  const elements = useSceneElements<SceneElement>(api)
  const drawn = React.useMemo(() => {
    const inside = insideFrames(elements)
    return new Map(elements.filter((e) => e.type === "frame").map((f) => [f.id, { frame: f, parts: thumbParts(f, inside.get(f.id) ?? []) }]))
  }, [elements])
  const move = (e: React.KeyboardEvent<HTMLOListElement>) => {
    const by = GRID_STEPS[e.key]
    const tiles = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button"))
    const at = tiles.indexOf(e.target as HTMLElement)
    if (!by || at < 0) return
    e.preventDefault()
    tiles[at + by]?.focus()
  }
  return (
    <ol data-arrows-own="" data-slides-grid="" className="grid grid-cols-2 gap-1.5" aria-label="Slides, in order" onKeyDown={jump ? move : undefined}>
      {deck.map((s, i) => {
        const up = s.id === slide
        const d = drawn.get(s.id)
        const inner = (
          <>
            <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-sunken p-1.5 ring-1 ring-line">
              {d && <FrameThumb fill frame={d.frame} parts={d.parts} />}
            </span>
            <span className="flex w-full min-w-0 items-center gap-1.5 px-0.5">
              <span className={cn("shrink-0 text-meta tabular-nums", up ? "text-brand-text" : "text-ink-3")}>{i + 1}</span>
              <span className={cn("min-w-0 flex-1 truncate text-ui-sm", up ? "font-medium text-brand-text" : "text-ink")}>{s.name || "Untitled frame"}</span>
            </span>
          </>
        )
        return (
          <li key={s.id} data-slide-tile={s.id}>
            {jump ? (
              <button
                type="button"
                aria-current={up ? "step" : undefined}
                onClick={() => jump(s.id)}
                className={cn(TILE, "transition-colors focus-visible:ring-2 focus-visible:ring-brand", up ? "bg-brand-muted" : "hover:bg-hover")}
              >
                {inner}
              </button>
            ) : (
              <div aria-current={up ? "step" : undefined} className={cn(TILE, up && "bg-brand-muted")}>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The outline's two views of the deck. */
const VIEWS = [
  { value: "list", label: "List", icon: ListOrdered },
  { value: "grid", label: "Grid", icon: LayoutGrid },
] as const

export default function BoardSlides({
  api,
  doc,
  slide,
  onSlide,
  outline,
  onOutline,
  board,
  frameNotes: WithFrameNotes,
  notesOpen = false,
  onNotesOpen,
  polls,
}: {
  api: SlidesApi
  /** The board's document, for the Frames panel's order. */
  doc: Y.Doc | undefined
  /** The slide: the presenter's own, or the one the presenter shows. "" is the canvas; FIRST_SLIDE asks for the deck's first. */
  slide: string
  /** Presenting: moves the slide (the presenter's view, and the stamp). None, and this screen follows. */
  onSlide?: (to: string) => void
  outline: boolean
  onOutline: (open: boolean) => void
  /** The board, whose presenter notes the presenter sees. */
  board?: string
  /** Presenter notes' read and write, from the board page's first load (components/board/frameNotesReads); none for a guest. */
  frameNotes?: FrameNotesSource
  /** On a phone, the slide's notes' drawer is open (Notes in the Presenting pill, boardFacilitation). */
  notesOpen?: boolean
  onNotesOpen?: (open: boolean) => void
  /** Where the board's polls are read: a member's board and the page's client and topic, or a guest's link; none, no polls. */
  polls?: SlidePollsSource
}) {
  const { isMobile } = useMedia()
  const sheet = useSheetMode()
  const deck = useBoardDeck(api, doc)
  const presenting = !!onSlide
  const on = presenting && !!slide && slide !== FIRST_SLIDE

  // Presenting starts at the deck's first slide; with no frames, on the canvas as before.
  React.useEffect(() => {
    if (slide === FIRST_SLIDE) onSlide?.(deck[0]?.id ?? "")
  }, [slide, deck, onSlide])

  // Gone to the canvas (Go to canvas): the slide the deck waits on while the presenter roams the canvas, their stamp
  // carrying no slide, so everyone follows their view as plain Present does; "" on a slide, or with the slides ended.
  const [waits, setWaits] = React.useState("")
  const away = presenting && !slide && !!waits
  // A slide up again (Back to slide, the outline, the grid): the deck no longer waits.
  React.useEffect(() => {
    if (slide) setWaits("")
  }, [slide])
  const letGo = useSlideCamera(api, slide, presenting)
  const go = React.useCallback((to: string) => onSlide?.(to), [onSlide])
  const from = React.useCallback(() => slide, [slide])
  const step = useSlideSteps(api, SCREEN, deck, from, go, on)
  // One press ends the slides entirely: from a slide back where the canvas was before them, from the canvas where it is.
  const end = React.useCallback(() => {
    letGo(on)
    setWaits("")
    onOutline(false)
    onSlide?.("")
  }, [letGo, on, onOutline, onSlide])
  const toCanvas = () => {
    setWaits(slide)
    onSlide?.("")
  }
  // Esc on a slide ends the slides, through the page's one Escape (lib/keys/escape): what's open above takes it first
  // (the outline on a computer, below), and with something selected it's Excalidraw's. On the canvas it's the canvas's.
  React.useEffect(() => (on ? onEscape("page", () => (selectionOn(api) ? false : end())) : undefined), [on, api, end])
  useEscapeClosesPanel(outline && !sheet, () => onOutline(false))
  // The frame of the slide that's up, or that the deck waits on, deleted (by anyone): the frame that took its place in
  // the panel's order, the next, or the one before it if it was the last; with none left the slides end.
  const shown = React.useRef(deck)
  React.useEffect(() => {
    const before = shown.current
    shown.current = deck
    const at = on ? slide : away ? waits : ""
    if (!at) return
    const to = slideInPlaceOf(before, deck, at)
    if (to === at) return
    if (!to) end()
    else if (on) onSlide?.(to)
    else setWaits(to)
  }, [deck, on, away, slide, waits, onSlide, end])
  const [view, setView] = React.useState<"list" | "grid">("list")

  const lifted = useSelecting(api, isMobile && on)
  const place = slidePlace(deck, slide)
  const waiting = away ? slidePlace(deck, waits) : null
  // On a phone the slide has the board to itself while it's up: the presenter's, and an editor's following it.
  useSlidesMark(isMobile && (on || (!presenting && !!place)))
  const said = place ? `Slide ${place.at} of ${place.of}${place.name ? `, ${place.name}` : ""}` : waiting ? `On the canvas: the slides wait on slide ${waiting.at}` : ""
  const jump = (id: string) => {
    onSlide?.(id)
    // On a phone the sheet goes, to show the slide.
    if (sheet) onOutline(false)
  }
  // The slide's notes, the presenter's alone (the one gate: a follower neither asks nor sees).
  const mayNotes = presenting
  const withNotes = (frame: string, draw: (reads: FrameNotesReads) => React.ReactNode) =>
    WithFrameNotes && board && mayNotes && frame ? (
      <WithFrameNotes board={board} may={mayNotes}>
        {draw}
      </WithFrameNotes>
    ) : null
  // The slide's poll: the frame that's up, the presenter's or the one a follower is on (none on the canvas).
  const pollsRead = useSlidePolls(polls)
  const pollHttp = polls && "http" in polls ? polls.http : undefined
  const frameUp = (on || (!presenting && !!place)) && slide !== FIRST_SLIDE ? slide : ""
  const slidePoll = slidePollOf(pollsRead.polls, frameUp)
  const [composing, setComposing] = React.useState(false)
  const pollAnchor = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => setComposing(false), [frameUp])
  // Add a poll is the presenter's (Present is an editor's), while the slide's frame has no open poll.
  const mayAddPoll = on && !!pollHttp && (!slidePoll || slidePoll.closed)
  // Close poll goes with the poll it closed: the focus, dropped to the page, goes to the Add a poll that comes back.
  const refocusAdd = React.useRef(false)
  React.useEffect(() => {
    if (!mayAddPoll || !refocusAdd.current) return
    refocusAdd.current = false
    if (!document.activeElement || document.activeElement === document.body) pollAnchor.current?.focus()
  }, [mayAddPoll])
  const notesOf = (frame: string) => withNotes(frame, (reads) => <SlideNotes key={frame} frame={frame} reads={reads} />)
  const arrow = cn(
    "grid shrink-0 place-items-center rounded-[14px] text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
    isMobile ? "size-11" : "size-8",
  )
  const bar = (
    <SlideBar deck={deck} slide={slide} step={step} arrow={arrow} fingerSized={isMobile} className={cn("flex min-w-0 items-center", !isMobile && "gap-1")}>
      <button
        type="button"
        data-touch-target
        aria-expanded={outline}
        onClick={() => onOutline(!outline)}
        title={outline ? "Close the outline" : "Open the outline"}
        className={cn(
          "flex min-w-0 max-w-[24ch] items-center gap-1.5 rounded-[14px] text-ui-sm font-medium tabular-nums text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3",
          isMobile ? "h-11 px-1" : "h-8 px-2.5",
        )}
      >
        {/* On a phone the words alone: at 390 "2 of 3 · Q4 numbers" (119 px of Inter) needs the icon's 22 px too (DB-133 F2),
            and, beside Add a poll, the padding, the slide group's gaps (its arrows' touch spacing too) and the divider (presenterBar). */}
        {!isMobile && <ListOrdered aria-hidden />}
        <span className="truncate">{slideWords(deck, slide)}</span>
      </button>
    </SlideBar>
  )
  const button = "flex shrink-0 items-center gap-1.5 rounded-[14px] text-ui-sm font-medium outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-4"
  const iconOnPhone = cn(button, "text-ink-2", isMobile ? "size-11 justify-center" : "h-8 px-2.5")
  const endButton = (
    <button type="button" data-touch-target onClick={end} aria-label={isMobile ? "End slides" : undefined} className={iconOnPhone}>
      {isMobile ? <X aria-hidden /> : "End slides"}
    </button>
  )
  const divider = <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-2" />
  // On a phone the bar is five 44 px controls and the name in 354 px (the dock's 366 less the surface's 12), as Chromium
  // lays it at 390 with touch. The slide group's arrows are 44 px, so it is no touch group (SlideBar fingerSized): as
  // one, phone.css F3b stood them 12 px from the name under a finger. With those 24 px, the divider's 9 and the name's
  // desktop padding, "2 of 3 · Q4 numbers" had 81 of its 119 px; without them 126 (the arrows' own air sets it apart).
  const presenterBar = (
    <>
      {bar}
      {!isMobile && divider}
      {mayAddPoll && (
        <button
          ref={pollAnchor}
          type="button"
          data-touch-target
          aria-expanded={composing}
          onClick={() => setComposing(true)}
          aria-label={isMobile ? "Add a poll" : undefined}
          title="Put a poll on this slide: everyone following votes"
          className={iconOnPhone}
        >
          <BarChart3 aria-hidden />
          {!isMobile && "Add a poll"}
        </button>
      )}
      <button type="button" data-touch-target onClick={toCanvas} aria-label={isMobile ? "Go to canvas" : undefined} title="Leave the slide for the canvas: everyone follows you there" className={iconOnPhone}>
        <Hand aria-hidden />
        {!isMobile && "Go to canvas"}
      </button>
      {endButton}
    </>
  )
  // On the canvas: Back to the slide the deck waits on, for everyone, and End slides.
  const canvasBar = waiting && (
    <>
      <button type="button" data-touch-target onClick={() => onSlide?.(waits)} className={cn(button, "text-brand-text", isMobile ? "h-11 px-3" : "h-8 px-2.5")}>
        <Presentation aria-hidden />
        Back to slide {waiting.at}
      </button>
      {divider}
      {endButton}
    </>
  )
  const ownBar = on ? presenterBar : canvasBar

  // The outline: a side panel beside the bar on a computer; on a phone a sheet, the presenter's bar at its foot.
  const panel = outline && (
    <BoardSidePanel
      {...SIDE_PANELS.slides()}
      count={deck.length}
      footer={(asSheet) =>
        asSheet ? (ownBar && deck.length > 0 ? <div className="flex items-center justify-center">{ownBar}</div> : null) : notesOf(waiting ? waits : slide === FIRST_SLIDE ? "" : slide)
      }
      onClose={() => onOutline(false)}
    >
      {deck.length === 0 ? (
        <NoFrames editable={presenting} />
      ) : (
        <>
          <div className="flex justify-end px-1 pb-1.5">
            <SegmentedControl aria-label="Show the slides as" value={view} onValueChange={setView} options={VIEWS} />
          </div>
          {view === "grid" ? (
            <Grid api={api} deck={deck} slide={waiting ? waits : slide} jump={presenting ? jump : undefined} />
          ) : (
            <Outline deck={deck} slide={waiting ? waits : slide} jump={presenting ? jump : undefined} />
          )}
        </>
      )}
    </BoardSidePanel>
  )

  // Over the board: the presenter's bar on a slide or on the canvas, a follower's "Slide 2 of 3"; none while a phone's
  // sheet is up.
  const floating = ownBar && deck.length > 0 ? (
    <div role="toolbar" aria-label="Slide controls" className={cn(BAR_SURFACE, "h-11 text-ui-sm")}>
      {ownBar}
    </div>
  ) : !presenting && place ? (
    <button
      type="button"
      aria-expanded={outline}
      aria-label={`${said}: open the outline`}
      onClick={() => onOutline(!outline)}
      className={cn(BAR_SURFACE, "h-11 gap-1.5 px-3.5 text-ui-sm font-medium tabular-nums outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-4 [&_svg]:text-ink-3")}
    >
      <ListOrdered aria-hidden />
      Slide {place.at} of {place.of}
    </button>
  ) : null

  // The slide's poll: on a computer a strip at the board's right; where sheets open (useSheetMode) a bar in the slides'
  // dock above the slide bar (none while the outline's sheet is up, which holds the bar: then only the composer).
  const docked = !!floating && !(outline && sheet)
  const pollAt = !sheet ? "side" : docked ? "dock" : "none"
  const pollPiece = (slidePoll || composing || (!!frameUp && !pollsRead.polls && pollsRead.state === "failed")) && (
    <React.Suspense fallback={null}>
      <SlidePoll
        poll={slidePoll}
        board={polls && "board" in polls ? polls.board : ""}
        frame={frameUp}
        frameName={place?.name || `slide ${place?.at ?? 1}`}
        http={pollHttp}
        read={pollsRead}
        put={pollsRead.put}
        composing={composing}
        onComposing={setComposing}
        anchor={pollAnchor}
        at={pollAt}
        onClosed={() => void (refocusAdd.current = true)}
      />
    </React.Suspense>
  )

  return (
    <>
      {docked && (
        <SlidesDock lifted={lifted}>
          {pollAt === "dock" && pollPiece ? (
            <div className="flex max-w-full flex-col items-center gap-2">
              {pollPiece}
              {floating}
            </div>
          ) : (
            floating
          )}
        </SlidesDock>
      )}
      {panel}
      {pollAt !== "dock" && pollPiece}
      {sheet &&
        on &&
        withNotes(slide, (reads) => (
          <SlideNotesDrawer key={slide} frame={slide} name={place?.name || `slide ${place?.at ?? 1}`} reads={reads} open={notesOpen} onOpenChange={(o) => onNotesOpen?.(o)} />
        ))}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  )
}
