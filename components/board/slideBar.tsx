"use client"

/**
 * A deck's bar, one for a call's stage (components/livekit/stageSlides, meet-14)
 * and a board's own slides (components/board/boardSlides, miro-28): Previous,
 * the slide (each caller's own control: the call's list of every slide, a
 * board's outline) and Next, with PageUp and PageDown from anywhere but a
 * field, a dialog, a menu or a region that scrolls beside the board (a
 * presenter's clicker sends those), and the arrow keys on the board while
 * nothing on it is selected (Excalidraw nudges a selection with them). Each
 * caller moves the slide its own way: the call through the room's metadata, a
 * board through the presenter's own view and the presenting stamp.
 */

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { notForTheBoard } from "@/components/board/boardKeys"
import { slidePlace, stepSlide, type Slide } from "@/lib/calls/slides"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import { scrollerOf } from "@/lib/ui/scroller"

/** What the bar reads of the board: the scene, and whether anything on it is selected. */
export type SlideScene = Pick<ExcalidrawImperativeAPI, "getSceneElements" | "onChange" | "getAppState">

/** Whether anything on the board is selected: the arrows and Esc are Excalidraw's then. */
export const selectionOn = (api: Pick<SlideScene, "getAppState">) => Object.values(api.getAppState().selectedElementIds).some(Boolean)

/**
 * PageUp and PageDown from anywhere but a field, a dialog, a menu or a region that scrolls beside the board (a call's
 * chat pages itself); the arrows on the board while nothing on it is selected, and never in a part that moves by them
 * itself (data-arrows-own: a board's grid of slides). `stage` is the board's frame.
 */
export function useSlideKeys(api: SlideScene, stage: React.RefObject<HTMLElement | null>, step: (by: 1 | -1) => void, on = true) {
  React.useEffect(() => {
    if (!on) return
    const onTheBoard = (e: KeyboardEvent) => {
      const t = e.target
      const here = t === document.body || (t instanceof Node && !!stage.current?.contains(t))
      return here && !selectionOn(api) && !(t instanceof Element && t.closest("[data-arrows-own]"))
    }
    const besideTheStage = (e: KeyboardEvent) => {
      const box = scrollerOf(e.target instanceof Element ? e.target : null)
      const at = stage.current
      return !!box && !!at && !box.contains(at) && !at.contains(box)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || notForTheBoard(e)) return
      const page = e.key === "PageDown" ? 1 : e.key === "PageUp" ? -1 : 0
      const arrow = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
      const by = page ? (besideTheStage(e) ? 0 : page) : arrow && onTheBoard(e) ? arrow : 0
      if (!by) return
      // Before Excalidraw, which scrolls the canvas on PageUp and PageDown.
      e.preventDefault()
      e.stopPropagation()
      step(by)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [api, stage, step, on])
}

/**
 * A step through the deck, by the bar's buttons and the keys: from the slide `from` says (the one asked for last,
 * while a move is on its way), to `go`. The deck is read when a key is pressed: drawing and reordering change it, and
 * the keys stay bound.
 */
export function useSlideSteps(api: SlideScene, stage: React.RefObject<HTMLElement | null>, deck: readonly Slide[], from: () => string, go: (to: string) => void, on = true) {
  const deckNow = React.useRef(deck)
  React.useEffect(() => {
    deckNow.current = deck
  }, [deck])
  const step = React.useCallback(
    (by: 1 | -1) => {
      const to = stepSlide(deckNow.current, from(), by)
      if (to !== null) go(to)
    },
    [from, go],
  )
  useSlideKeys(api, stage, step, on)
  return step
}

/** Where the deck is, in the bar's words: "2 of 8 · Plan", or "Whole board". Pure. */
export function slideWords(deck: readonly Slide[], slide: string): string {
  const place = slidePlace(deck, slide)
  return place ? `${place.at} of ${place.of}${place.name ? ` · ${place.name}` : ""}` : "Whole board"
}

/**
 * Previous, the caller's control for the slide (`children`), and Next, in one group whose taps meet and never cover a
 * neighbour's (phone.css F3). `arrow` draws the two buttons in the caller's surface. Arrows drawn at a finger's size
 * (`fingerSized`, 44 px: a phone's board) reach no further than their own box, so theirs is no touch group: under a
 * finger F3b would stand them 12 px apart whatever the caller's classes say, and a phone's bar has no pixels to spare.
 */
export function SlideBar({ deck, slide, step, arrow, fingerSized = false, className, children }: { deck: readonly Slide[]; slide: string; step: (by: 1 | -1) => void; arrow: string; fingerSized?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label="Slides" data-touch-group={fingerSized ? undefined : "32"} className={className ?? "flex shrink-0 items-center gap-1"}>
      <button type="button" data-touch-target className={arrow} aria-label="Previous slide" disabled={stepSlide(deck, slide, -1) === null} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </button>
      {children}
      <button type="button" data-touch-target className={arrow} aria-label="Next slide" disabled={stepSlide(deck, slide, 1) === null} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}
