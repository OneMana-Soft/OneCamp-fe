"use client"

import { useState } from "react"
import { Check, X } from "@/lib/icons"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { ANSWER_WORD, faceLabel, responseOf } from "@/lib/calendar/answers"

/** Someone on an event, as their face shows them. */
export interface FaceGuest {
  key: string
  name: string
  /** What seeds their face's hue (avatarSeed): the same person, the same hue everywhere. */
  seed: string
  response: string
  note?: string
  organiser?: boolean
  /** Invited by email, from outside the workspace. */
  outside?: boolean
  src?: string
  /** A member's address or handle, or a guest's address when they're named. */
  detail?: string
  /** A guest by email's address. */
  email?: string
  /** To the organiser: whether a guest by email was emailed their invitation. */
  invite?: string
}

/** How many faces show before the row folds to faces and counts (STEP4_PLAN §4 #5). */
export const FACES_BEFORE_FOLD = 4

/**
 * A guest's answer as a 12 px mark at their face's bottom right, on a ring of
 * the card's surface: going a moss check, maybe a sun "?", not going a danger
 * cross. No answer, no mark; the organiser is going. A dot on a face
 * (app/radiusScale.test.ts counts it among the round ones).
 */
function AnswerMark({ response, organiser }: { response: string; organiser?: boolean }) {
  const r = organiser ? "accepted" : responseOf(response)
  if (r === "needs_action") return null
  return (
    <span
      aria-hidden="true"
      data-answer-mark={r}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full ring-2 ring-pop",
        r === "accepted" && cn(HUE_CLASS.moss, "bg-hue text-white"),
        r === "tentative" && cn(HUE_CLASS.sun, "bg-hue text-white"),
        r === "declined" && "bg-destructive text-white",
      )}
    >
      {r === "accepted" ? <Check className="size-2" /> : null}
      {r === "tentative" ? <QuestionGlyph /> : null}
      {r === "declined" ? <X className="size-2" /> : null}
    </span>
  )
}

/** A "?" drawn at 8 px: the mark is too small for type (the 11 px floor). */
function QuestionGlyph() {
  return (
    <svg viewBox="0 0 8 8" className="size-2" fill="none" aria-hidden="true">
      <path d="M2.6 2.8a1.45 1.45 0 1 1 2.1 1.3c-.45.25-.7.55-.7 1.05v.15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="4" cy="6.85" r=".7" fill="currentColor" />
    </svg>
  )
}

/** One face with its answer's mark, named for a screen reader: "Maya Chen, going". */
export function GuestFace({ g, size = 20 }: { g: FaceGuest; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" role="img" aria-label={faceLabel(g.name, g.response, g.organiser)} data-face={g.key}>
      <IdentityMark variant="avatar" size={size} id={avatarSeed(g.seed)} label={g.name} src={g.src} className="ring-2 ring-pop" />
      <AnswerMark response={g.response} organiser={g.organiser} />
    </span>
  )
}

/**
 * An event's guests as faces with their answers (STEP4_PLAN §4 #5): the
 * organiser first, then going, maybe, not going and no answer, 24 px faces
 * 6 px apart. Under them, `summary` on a line of its own, wrapping inside
 * the card (the names, or the counts for the organiser and once it folds).
 * Above four, the row folds to the first faces, and the counts open the
 * list, each answer in words.
 */
export function GuestFaces({ guests, summary, className }: { guests: FaceGuest[]; summary: string; className?: string }) {
  const [open, setOpen] = useState(false)
  // Above four guests, the organiser not counted (eventGuests' guestsFold).
  const folds = guests.filter((g) => !g.organiser).length > FACES_BEFORE_FOLD
  const shown = folds ? guests.slice(0, FACES_BEFORE_FOLD) : guests
  return (
    <div className={cn("min-w-0", className)} data-guest-faces="">
      {/* Apart, never overlapping: each face's answer is at its bottom right. */}
      <span className="flex flex-wrap gap-1.5">
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
