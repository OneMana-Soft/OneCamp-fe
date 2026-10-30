"use client"

import * as React from "react"

import { EmptyState } from "@/components/ui/empty-state"
import { ErrorRow } from "@/components/ui/error-row"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { loadFailure } from "@/lib/http/loadFailure"
import { ChevronRight, UserRoundSearch } from "@/lib/icons"
import { whoKnowsKey } from "@/lib/whoKnows/key"
import { isRefused, type WhoKnowsAnswer } from "@/lib/whoKnows/whoKnows"
import { useRovingRows } from "@/components/workGraph/GraphRow"
import { WhoKnowsPersonRow, YouAreHidden } from "./WhoKnowsList"
import { STRIP_PEOPLE, StripLoading, WhoKnowsFrame } from "./WhoKnowsSlot"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The panel loads on the first press, warmed on hover and focus.
const Overlay = lazyPiece(() => import("./WhoKnowsOverlay"))
const warm = () => void import("./WhoKnowsOverlay")

/**
 * "Who knows about …" on the search page (DG9, both editions): the first few
 * people whose work on the words the reader can open, and "See who and why"
 * for all of them with their items. It says nothing until there are words
 * worth asking about, and nothing at all when the server refuses the asker
 * (not a member) or the words: the page's own results are the answer then.
 * Otherwise it fills the page's held slot (./WhoKnowsSlot) in its frame,
 * whatever it shows (loading, its people, no one yet, a failure), so the
 * results under it never move.
 */
export function WhoKnowsStrip({ words }: { words: string }) {
  const key = whoKnowsKey(words, STRIP_PEOPLE)
  const { data, isError, isPrevious, isLoading, mutate } = useFetch<{ data?: WhoKnowsAnswer }>(key, undefined, { revalidateOnFocus: false, keepPreviousData: true }, OWN_ERRORS)
  const [open, setOpen] = React.useState(false)
  const [retrying, setRetrying] = React.useState(false)
  const anchor = React.useRef<HTMLButtonElement>(null)
  const roving = useRovingRows()
  if (!key) return null
  if (isError && (isRefused(isError) || loadFailure(isError) === "gone")) return null
  const answer = data?.data
  const shown = words.trim()

  let content: React.ReactNode
  // The people kept from the last words aren't who knows about these (useFetch's isPrevious).
  if (isError && (isPrevious || !answer)) {
    // One row, centred in the held slot, so Try again is always in view (DESIGN-BUILD-16, 25 Oct).
    content = (
      <ErrorRow
        subject="who knows about this"
        className="my-auto px-2 py-1.5"
        retrying={retrying}
        onRetry={() => {
          setRetrying(true)
          void mutate().finally(() => setRetrying(false))
        }}
      />
    )
  } else if (!answer && isLoading) {
    content = <StripLoading />
  } else if (answer && !answer.people.length) {
    // No one knows: said in the same held slot, so nothing under it moves (main, 25 Oct),
    // and centred in it with the strip's mark, so the space reads as meant (DESIGN-BUILD-16).
    content = (
      <EmptyState
        icon={UserRoundSearch}
        title="No one yet"
        description="Nobody has written, been assigned or commented on anything about this that you can open."
        className="my-auto px-4 py-2"
      />
    )
  } else if (answer) {
    // The note that you're hidden takes one person's room (DESIGN-BUILD-16, 25 Oct).
    const people = answer.people.slice(0, answer.you_hidden ? STRIP_PEOPLE - 1 : STRIP_PEOPLE)
    content = (
      <ul onKeyDown={roving} className="flex flex-col gap-0.5">
        {people.map((p) => (
          <li key={p.id}>
            <WhoKnowsPersonRow person={p} full={false} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <WhoKnowsFrame
        words={words}
        action={
          answer && answer.people.length ? (
            <button
              ref={anchor}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-who-knows-open=""
              onPointerEnter={warm}
              onFocus={warm}
              onClick={() => setOpen((o) => !o)}
              // Its own neutral states, outside the interaction layer: the layer's
              // tint with no area hue is the accent, and open must never be orange.
              // Hover is the hover tint, open the press tint.
              className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-sm px-2 max-sm:ml-6 max-sm:basis-full max-sm:justify-start text-meta font-medium text-ink-2 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-press aria-expanded:text-ink"
            >
              See who and why
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          ) : null
        }
      >
        {answer?.you_hidden ? (
          <div className="px-1 pb-1.5">
            <YouAreHidden />
          </div>
        ) : null}
        {content}
      </WhoKnowsFrame>
      {/* A portal anchored to See who and why: where it sits in the tree doesn't move it. */}
      {open ? (
        <React.Suspense fallback={null}>
          <Overlay words={shown} anchor={anchor} onClose={() => setOpen(false)} />
        </React.Suspense>
      ) : null}
    </>
  )
}
