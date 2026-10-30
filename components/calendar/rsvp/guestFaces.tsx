"use client"

import { Check, X } from "@/lib/icons"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { faceLabel, responseOf } from "@/lib/calendar/answers"
import type { EventProposal } from "@/types/calendar"

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
  /** Another time they proposed, where the reader may see it (calendar head 4). */
  proposal?: EventProposal
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
