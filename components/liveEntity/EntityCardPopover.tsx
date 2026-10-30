"use client"

import * as React from "react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { anchorTo } from "@/components/ui/anchor"
import { hoverCardProps } from "@/lib/hub/hoverIntent"
import { entityKind } from "@/lib/liveEntity"
import { lazyPiece, type LazyPiece } from "@/lib/lazy/lazyPiece"

type Card = React.ComponentType<{ id: string; data: unknown }>

// One lazy card per kind, made once: its code loads the first time a pointer
// rests on a chip of that kind.
const cards = new Map<string, LazyPiece<React.ComponentProps<Card>>>()

function cardOf(kind: string): LazyPiece<React.ComponentProps<Card>> | null {
  const load = entityKind(kind)?.card
  if (!load) return null
  let card = cards.get(kind)
  if (!card) cards.set(kind, (card = lazyPiece(load as () => Promise<{ default: Card }>)))
  return card
}

/**
 * The card a chip opens while the pointer rests on it (hub P1's hover intent:
 * 450 ms to open, and moving into the card keeps it), or on Space from the
 * keyboard (keyed): then the card takes the focus, so it is read out, and
 * gives it back to the chip when it closes. Not on touch: a tap opens the
 * thing itself.
 */
export default function EntityCardPopover({ kind, id, data, anchor, keyed = false, onClose }: { kind: string; id: string; data: unknown; anchor: HTMLElement; keyed?: boolean; onClose(): void }) {
  const Card = cardOf(kind)
  // Measured on each ask, never the corner (components/ui/anchor).
  const at = React.useMemo(() => ({ current: anchorTo(anchor) }), [anchor])
  if (!Card) return null
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={at} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl p-3 shadow-e3"
        onOpenAutoFocus={(e) => {
          if (!keyed) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (keyed) anchor.focus()
        }}
        {...hoverCardProps}
      >
        <React.Suspense fallback={<div className="h-14" aria-hidden="true" />}>
          <Card id={id} data={data} />
        </React.Suspense>
      </PopoverContent>
    </Popover>
  )
}
