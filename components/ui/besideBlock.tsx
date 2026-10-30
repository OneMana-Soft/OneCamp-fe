"use client"

import { useCallback, useState, type ComponentProps } from "react"

import { EDGE_PX, PopoverContent } from "@/components/ui/popover"

/** A card's gap from the block it stands by. */
const GAP_PX = 12

type Side = "right" | "left" | "bottom"

/**
 * The side a card `width` px wide opens on, by a block whose box runs from
 * `at.left` to `at.right`, in a window `windowWidth` px wide: right when the
 * window leaves it the room (the card, its gap and every popover's EDGE_PX),
 * else left, else below. Radix flips a card only to the opposite side, so a
 * block as wide as the window (a Day view's event, a week-long bar) had its
 * card cut by the window's left edge (V-60). Below, Radix's flip takes it
 * above when below has no room, and its shift keeps it inside the window.
 */
function sideWithRoom(at: { left: number; right: number }, width: number, windowWidth: number): Side {
  const room = width + GAP_PX + EDGE_PX
  if (windowWidth - at.right >= room) return "right"
  if (at.left >= room) return "left"
  return "bottom"
}

type BesideBlockProps = Omit<ComponentProps<typeof PopoverContent>, "ref" | "side" | "align" | "sideOffset" | "collisionPadding"> & {
  /** The block it stands by, measured on each ask (components/ui/anchor's anchorTo). */
  at: { getBoundingClientRect(): DOMRect }
}

/**
 * The PopoverContent of a card that stands by a block (an event's card, New
 * event by its ghost): beside it, 12 px off, on sideWithRoom's side, and kept
 * off the window's edge by PopoverContent's own default, as every popover is.
 * The side is measured with the card's own width as it reaches the page, and
 * again by a new block (the ref is made anew, so React hands it the card
 * again). It is kept in here, so a side found after the first draw draws this
 * again, not the card inside it.
 */
export function BesideBlockContent({ at, ...props }: BesideBlockProps) {
  const [side, setSide] = useState<Side>("right")
  const measure = useCallback(
    (card: HTMLElement | null) => {
      if (card) setSide(sideWithRoom(at.getBoundingClientRect(), card.offsetWidth, document.documentElement.clientWidth))
    },
    [at],
  )
  return <PopoverContent {...props} ref={measure} side={side} align="start" sideOffset={GAP_PX} />
}
