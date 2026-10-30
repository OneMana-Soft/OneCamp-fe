"use client"

// An invitation to an event, from the link in its email (calendar A2): what
// it is, when (in the guest's own zone), who asked, and "Going?", with no
// account. A button in the email lands here with its answer (?answer=yes),
// which is sent at once and then dropped from the address, so a reload sends
// nothing again; the guest can change it, leave a note for the organiser,
// and propose another time for an event that takes one (calendar head 4).

import { use, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"
import { browserTZ } from "@/lib/utils/timeZone"
import { publicTrouble, retryDelayMs, retryingText, sendFailedText, type PublicTrouble } from "@/services/publicApi"
import { answerInvitation, getInvitation, linkAnswer, type InvitationView } from "@/services/eventInvitationService"
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame"
import { PublicGoneLater as PublicGone } from "@/components/guest/publicGoneLater"
import { YourAnswer } from "@/components/calendar/rsvp/yourAnswer"
import { ANSWER_WORD, responseOf } from "@/lib/calendar/answers"
import { invitationWhen } from "@/lib/calendar/invitationWhen"
import { callWithInvitation } from "@/lib/calls/invitationKey"
import type { Answer } from "@/lib/calendar/eventsApi"
import type { EventProposal } from "@/types/calendar"

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<InvitationView | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  // Too many requests from here, or no answer: said, and asked again later.
  const [trouble, setTrouble] = useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [tz, setTz] = useState("UTC")
  // The answer the email's button carried, sent once.
  const fromLink = useRef<Answer | null | undefined>(undefined)

  useEffect(() => setTz(browserTZ()), [])
  useEffect(() => {
    if (fromLink.current === undefined) {
      fromLink.current = linkAnswer(new URLSearchParams(window.location.search).get("answer"))
      if (fromLink.current) window.history.replaceState(null, "", window.location.pathname)
    }
    let live = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async () => {
      const res = await getInvitation(token)
      if (!live) return
      if (res.ok) {
        setTrouble(null)
        setView(res.data)
        setState("ready")
        const wanted = fromLink.current
        fromLink.current = null
        if (wanted && !res.data.ended && responseOf(res.data.you.response) !== wanted) {
          const sent = await answerInvitation(token, { answer: wanted })
          if (live && sent.ok) setView(sent.data)
        }
        return
      }
      const t = publicTrouble(res.status)
      if (t === "gone") {
        setState("missing")
        return
      }
      setTrouble(t)
      timer = setTimeout(() => void attempt(), retryDelayMs(failures++, res.retryAfter))
    }
    void attempt()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [token])

  if (state === "missing") {
    return <PublicGone surface="invitation" noun="invitation" detail="Ask whoever invited you to send it again." />
  }

  // An answer from this page: shown at once by its control, sent here, with
  // another time when one is proposed (null takes it back).
  const send = async (answer: Answer, note?: string, proposal?: EventProposal | null) => {
    const res = await answerInvitation(token, {
      answer,
      ...(note === undefined ? {} : { note }),
      ...(proposal === undefined ? {} : { proposal: proposal ?? {} }),
    })
    if (res.ok) {
      setView(res.data)
      return true
    }
    // A time the server won't take (400) is said in its words; only a missing invitation is gone.
    if (res.status !== 400 && publicTrouble(res.status) === "gone") setState("missing")
    else if (proposal !== undefined) {
      toast({ title: proposal ? "Couldn't propose that time" : "Couldn't take your proposal back", description: sendFailedText(res), variant: "destructive" })
    }
    return false
  }

  const when = view ? invitationWhen(view.start, view.end, view.all_day, tz) : null
  const organiser = view?.organiser || "The organiser"
  const proposeFrom = view?.proposable && view.start.at && view.end.at ? { start: new Date(view.start.at), end: new Date(view.end.at) } : undefined
  return (
    <PublicFrame surface="invitation" header={false} mainClassName="flex-none px-4 pt-6 sm:pt-[72px]">
      <PaperCard className="max-w-[560px] rounded-[16px] px-5 pb-8 pt-8 shadow-e1 sm:px-9" data-invitation="">
        {state === "loading" || !view || !when ? (
          <div role="status" aria-label="Loading your invitation" className="flex flex-col gap-3">
            {trouble ? (
              <p className="text-ui-sm text-ink-2" data-invitation-retrying="">
                {retryingText[trouble]}
              </p>
            ) : null}
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div>
            <p className="text-meta text-ink-3">{organiser} invited you</p>
            <h1 className="mt-1 text-title-2 text-ink">{view.title}</h1>
            <div className="mt-5 rounded-xl bg-sunken p-4" data-ticket="">
              <p className="text-heading font-semibold text-ink">{when.day}</p>
              <p className="mt-0.5 text-ui tabular-nums text-ink-2">
                {when.time}
                {when.zone ? <span className="text-ink-3"> · {when.zone}</span> : null}
              </p>
              {view.repeats ? <p className="mt-1 text-ui-sm text-ink-2">{view.repeats}</p> : null}
              {view.location ? <p className="mt-1 text-ui-sm text-ink-2">{view.location}</p> : null}
            </div>
            {view.call_address && !view.ended ? (
              <Button asChild className="mt-4 w-full sm:w-auto">
                <a href={callWithInvitation(view.call_address, token)} data-invitation-join="">
                  Join call
                </a>
              </Button>
            ) : null}

            {view.ended ? (
              <p className="mt-5 text-ui-sm text-ink-2" data-invitation-ended="">
                This event has happened.
              </p>
            ) : (
              <YourAnswer
                answer={view.you.response}
                note={view.you.note}
                organiserName={organiser}
                onAnswer={send}
                proposal={view.you.proposal}
                proposeFrom={proposeFrom}
              />
            )}

            {view.guests?.length ? (
              <section className="mt-6" aria-label="Who's invited">
                <h2 className="text-ui-sm font-medium text-ink">Who&apos;s invited</h2>
                <ul className="mt-1.5 grid gap-1">
                  <li className="flex min-h-7 items-center justify-between gap-3 text-ui-sm">
                    <span className="truncate text-ink">{organiser}</span>
                    <span className="shrink-0 text-meta text-ink-3">organiser</span>
                  </li>
                  {view.guests.map((g, i) => (
                    <li key={`${g.name}-${i}`} className="flex min-h-7 items-center justify-between gap-3 text-ui-sm">
                      <span className="truncate text-ink">{g.name}</span>
                      <span className="shrink-0 text-meta text-ink-3">{ANSWER_WORD[responseOf(g.response)]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {view.notes ? (
              <section className="mt-6" aria-label="Notes">
                <h2 className="text-ui-sm font-medium text-ink">Notes</h2>
                <p className="mt-1 whitespace-pre-line text-ui-sm text-ink-2">{view.notes}</p>
              </section>
            ) : null}

            <p className="mt-8 text-meta text-ink-3">
              Invited as {view.you.email}. Your answer goes to {organiser}.
            </p>
          </div>
        )}
      </PaperCard>
    </PublicFrame>
  )
}
