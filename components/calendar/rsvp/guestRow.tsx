"use client"

import { useDeferredValue, useState } from "react"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { ANSWER_WORD, responseOf } from "@/lib/calendar/answers"
import { FACES_BEFORE_FOLD, GuestFace, type FaceGuest } from "@/components/calendar/rsvp/guestFaces"

const NO_FACES: FaceGuest[] = []

/**
 * An event's guests as faces with their answers (STEP4_PLAN §4 #5): the
 * organiser first, then going, maybe, not going and no answer, 24 px faces
 * 6 px apart. Under them, `summary` on a line of its own, wrapping inside
 * the card (the names, or the counts for the organiser and once it folds).
 * Above four, the row folds to the first faces, and the counts open the
 * list, each answer in words. The faces come a pass after the rest (C3:
 * the press that opens a card paints sooner), their row keeping its height
 * meanwhile; drawn for one event, keyed by it.
 */
export function GuestFaces({ guests, summary, className }: { guests: FaceGuest[]; summary: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const faces = useDeferredValue(guests, NO_FACES)
  // Above four guests, the organiser not counted (eventGuests' guestsFold).
  const folds = guests.filter((g) => !g.organiser).length > FACES_BEFORE_FOLD
  const shown = folds ? faces.slice(0, FACES_BEFORE_FOLD) : faces
  return (
    <div className={cn("min-w-0", className)} data-guest-faces="">
      {/* Apart, never overlapping: each face's answer is at its bottom right. */}
      <span className="flex min-h-6 flex-wrap gap-1.5">
        {shown.map((g) => (
          <GuestFace key={g.key} g={g} size={24} />
        ))}
      </span>
      {folds ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mt-1 block max-w-full rounded-sm text-left text-meta tabular-nums text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          data-touch-target=""
        >
          {summary}
        </button>
      ) : (
        <p className="mt-1 text-meta tabular-nums text-ink-3">{summary}</p>
      )}
      {folds && open ? (
        <ul className="mt-2 grid grid-cols-1 gap-1" aria-label="Guests and their answers" data-guest-list="">
          {guests.map((g) => (
            <li key={g.key} className="flex min-h-7 min-w-0 items-center gap-2 text-ui-sm">
              <GuestFace g={g} size={24} />
              <span className="min-w-0 flex-1 truncate text-ink">{g.name}</span>
              {g.outside ? <span className={cn(HUE_CLASS.sun, "shrink-0 rounded-[5px] bg-hue-tint px-1 text-micro text-hue-ink")}>Guest</span> : null}
              <span className="shrink-0 text-meta text-ink-3">{g.organiser ? "organiser" : ANSWER_WORD[responseOf(g.response)]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
