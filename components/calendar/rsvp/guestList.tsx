"use client"

import { Link2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { ANSWER_WORD, countsLine, responseOf } from "@/lib/calendar/answers"
import { GuestFace, type FaceGuest } from "@/components/calendar/rsvp/guestFaces"
import { Proposals } from "@/components/calendar/rsvp/proposalsChunk"
import type { EventProposal } from "@/types/calendar"
import type { EventGuests } from "@/components/calendar/rsvp/eventGuests"

/** What the organiser is told of an invitation by email that didn't go. */
export const INVITE_WORDS: Record<string, string> = {
  not_sent: "Not emailed. Copy their link and send it yourself.",
  failed: "Their invitation couldn't be emailed. Copy their link and send it yourself.",
}

/**
 * An event's guests in its panel (calendar A2): the organiser first, then
 * going, maybe, not going and no answer, each with their answer in words and
 * the note they left. The organiser also sees how many said what, can ask
 * again whoever hasn't answered, copy the link of a guest invited by email
 * (to send it themselves when it wasn't emailed), and choose to be emailed
 * when guests answer. Another time a guest proposed shows on their row where
 * the server sends it, to be used or dismissed by whoever may change the
 * event (calendar head 4); the reader's own shows with their answer.
 */
export function EventGuestList({
  guests,
  organiser,
  ended,
  onNudge,
  onCopyLink,
  emailOnAnswers,
  onEmailOnAnswers,
  onUseProposal,
  onDismissProposal,
}: {
  guests: EventGuests
  /** The reader organises the event. */
  organiser: boolean
  ended: boolean
  onNudge?: () => void
  onCopyLink?: (email: string, name: string) => void
  /** The organiser's "Email me when guests answer", once the calendar's API has said it. */
  emailOnAnswers?: boolean
  onEmailOnAnswers?: (on: boolean) => void
  /** For whoever may change the event: moves it to a proposed time, or sets the proposal aside. */
  onUseProposal?: (p: EventProposal) => Promise<void>
  onDismissProposal?: (g: FaceGuest) => Promise<void>
}) {
  const others = guests.faces.filter((f) => !f.organiser)
  const asks = organiser && guests.answered
  // Everyone listed is counted, the organiser too: the number matches the counts under it.
  const listed = guests.answered ? guests.faces : others
  return (
    <section className="mt-6 space-y-2" data-event-guests="">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className={cn(sectionTitle, "flex items-baseline gap-1.5")}>
          Guests
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{listed.length}</span>
        </h3>
        {asks && onNudge && !ended && guests.counts.waiting > 0 ? (
          <Button variant="ghost" size="xs" onClick={onNudge} data-guests-nudge="">
            Ask again
          </Button>
        ) : null}
      </div>
      {asks && others.length > 0 ? <p className="text-meta tabular-nums text-ink-3">{countsLine(guests.counts)}</p> : null}
      {others.length > 0 ? (
        <ul aria-label="Guests and their answers">
          {listed.map((g) => {
            // Copying their link and dismissing their proposal name them by their address, which the demo hides.
            const unsent = organiser && g.outside && g.email && g.invite ? INVITE_WORDS[g.invite] : undefined
            const proposal = g.key !== guests.self ? g.proposal : undefined
            const dismissable = !g.outside || !!g.email
            return (
              <li key={g.key} className="flex min-h-9 min-w-0 items-start gap-2.5 py-1.5 text-sm" data-guest-row={g.organiser ? "organiser" : responseOf(g.response)}>
                <GuestFace g={g} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-h-6 min-w-0 items-center gap-1.5">
                    <span className="truncate text-foreground">{g.name}</span>
                    {g.outside ? <span className={cn(HUE_CLASS.sun, "shrink-0 rounded-[5px] bg-hue-tint px-1 text-micro text-hue-ink")}>Guest</span> : null}
                    {g.detail ? <span className="truncate text-xs text-muted-foreground">{g.detail}</span> : null}
                  </div>
                  {g.note ? <p className="text-meta text-ink-2">“{g.note}”</p> : null}
                  {proposal ? (
                    <Proposals.View fallback={null} render={(m) => <m.ProposedRow guest={g} proposal={proposal} onUse={onUseProposal} onDismiss={dismissable ? onDismissProposal : undefined} />} />
                  ) : null}
                  {unsent ? <p className="text-meta text-ink-3">{unsent}</p> : null}
                </div>
                {guests.answered ? (
                  <span className="flex min-h-6 shrink-0 items-center text-meta text-ink-3">{g.organiser ? "organiser" : ANSWER_WORD[responseOf(g.response)]}</span>
                ) : null}
                {organiser && g.outside && g.email && onCopyLink ? (
                  <Button variant="ghost" size="icon-sm" className="-my-0.5" aria-label={`Copy ${g.name}'s answer link`} title="Copy their answer link" onClick={() => onCopyLink(g.email!, g.name)}>
                    <Link2 />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No guests yet.</p>
      )}
      {asks && onEmailOnAnswers && others.length > 0 ? (
        <label className="flex min-h-9 items-center justify-between gap-3 text-sm text-foreground">
          Email me when guests answer
          <Switch checked={!!emailOnAnswers} onCheckedChange={onEmailOnAnswers} />
        </label>
      ) : null}
    </section>
  )
}
