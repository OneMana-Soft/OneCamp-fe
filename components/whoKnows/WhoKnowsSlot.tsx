"use client"

import * as React from "react"

import { SkeletonRows } from "@/components/ui/skeletonRows"
import { UserRoundSearch } from "@/lib/icons"
import { whoKnowsKey } from "@/lib/whoKnows/key"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

/** How many people the strip shows; the panel shows the rest with their items. */
export const STRIP_PEOPLE = 3

// The strip's code loads after the page's (DG9's weight stays off first load).
const Strip = lazyPiece(() => import("./WhoKnowsStrip").then((m) => ({ default: m.WhoKnowsStrip })))

/**
 * Where "Who knows about …" goes on the search page. The space is held from
 * the first frame, before the strip's code or its answer arrive, so the
 * results under it never move when it fills in (it once arrived late and
 * pushed the list down). The height fits the strip's heading
 * and its three people; at 390 "See who and why" takes a line of its own, and
 * the note that you're hidden takes one person's place. "No one yet" and a
 * failure keep the same height, so nothing jumps either way. The strip gives
 * the space back only when the server refuses the asker or the words.
 * Until the code arrives the space is already the strip loading, never a
 * blank card: a blank box reads as broken. Words too short to ask about hold
 * nothing: the strip would never fill that space, and it would close under
 * results already drawn.
 */
export function WhoKnowsSlot({ words }: { words: string }) {
  if (!whoKnowsKey(words, STRIP_PEOPLE)) return null
  return (
    <React.Suspense
      fallback={
        <WhoKnowsFrame words={words}>
          <StripLoading />
        </WhoKnowsFrame>
      }
    >
      <Strip words={words} />
    </React.Suspense>
  )
}

/**
 * The strip's card in the held space: its mark and "Who knows about …", an
 * action beside them, and the body, which scrolls inside the space under the
 * layer's fade when long names wrap at 390, never a hard cut.
 */
export function WhoKnowsFrame({ words, action, children }: { words: string; action?: React.ReactNode; children: React.ReactNode }) {
  const titleId = "who-knows-strip-title"
  return (
    <section aria-labelledby={titleId} data-who-knows-strip="" className="mt-3 flex h-[276px] flex-col rounded-xl bg-raised p-2 shadow-e1 sm:h-[208px]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1.5 pt-1">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-[7px] bg-sunken text-ink-2">
          <UserRoundSearch className="size-3.5" />
        </span>
        <h2 id={titleId} className="line-clamp-1 min-w-0 flex-1 break-words text-meta font-medium text-ink-2">
          Who knows about <span className="text-ink">“{words.trim()}”</span>
        </h2>
        {action}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-who-knows-body="" data-edge-fade="block">
        {children}
      </div>
    </section>
  )
}

/** The strip while it finds who knows: its people's rows, waiting. */
export function StripLoading() {
  return (
    <div role="status" aria-label="Finding who knows">
      <SkeletonRows rows={STRIP_PEOPLE} avatar lines={2} />
    </div>
  )
}
