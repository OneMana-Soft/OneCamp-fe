"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Headphones, PhoneOff } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { PeopleLine } from "@/components/ui/peopleLine"
import { formatElapsed } from "@/components/livekit/callLevels"
import { useNow } from "@/hooks/useNow"
import { firstNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import type { HuddleFace, HuddleFacts } from "@/lib/calls/huddle"
import type { CallSessionRead } from "@/components/livekit/callState"

/** "4 min", "1 h 5 min", "under a minute": how long an ended call ran. Pure. */
export function callLength(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 1) return "under a minute"
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`
}

/** "0:42", "4:05", "1:02:09": how long a call has been on at now; no start, or one ahead of this clock, is "0:00". Pure. */
export function elapsed(since: string | undefined, now: number): string {
  return formatElapsed(now - (Date.parse(since ?? "") || now))
}

/** What a huddle's card shows: whether its call is on, and who came or is in it. */
export interface HuddleCardState {
  state: "live" | "ended" | "missed" | "started"
  came: HuddleFace[]
  people: number
}

/**
 * A huddle card's state from its post's facts and its conversation's call
 * read. Live only while the conversation's call is this post's own; then its
 * faces are the members in it now and people counts guests too. Ended once
 * the facts say so, or once the read shows this call is no longer on (the
 * facts reach an open app on its next read of the conversation). A channel's
 * call nobody joined just ended; a DM's or a group's was missed. Until the
 * read comes, the card shows its facts as they are. Pure.
 */
export function huddleCardState(facts: HuddleFacts, read: CallSessionRead | undefined, inChannel: boolean): HuddleCardState {
  if (!facts.ended && read?.live && read.session?.id === facts.session) {
    const inCall = read.session.people.filter((p) => p.in_call)
    const came = inCall.flatMap((p) => (p.user_uuid && !p.guest ? [{ uuid: p.user_uuid, name: p.name }] : []))
    return { state: "live", came, people: inCall.length }
  }
  const state = facts.missed && !inChannel ? "missed" : facts.ended || read ? "ended" : "started"
  return { state, came: facts.came, people: facts.people }
}

export interface CallCardProps {
  facts: HuddleFacts
  /** The conversation's call read (Call State), while the post's call may be on. */
  read?: CallSessionRead
  inChannel: boolean
  /** Draws faces with the conversation's own stack (ThreadParticipants), which its page already holds. */
  faces: (came: HuddleFace[]) => ReactNode
  /** The page that joins the call; no Join without it (a preview). */
  href?: string
}

/**
 * A huddle's card (slack-06), in place of its post's words: on now, a moss
 * mark, who is in it, how long it has run and Join; over, how
 * long it ran and who came; a call nobody answered, "Missed call". It reads
 * nothing itself: the post's facts and the call's read come in as props.
 */
export default function CallCard({ facts, read, inChannel, faces, href }: CallCardProps) {
  const { state, came, people } = huddleCardState(facts, read, inChannel)
  const live = state === "live"
  const now = useNow(live)
  const title = live ? "Huddle on now" : state === "missed" ? "Missed call" : state === "ended" ? "Huddle ended" : "Huddle"
  const meta = live ? elapsed(facts.started, now) : state === "ended" && facts.seconds > 0 ? callLength(facts.seconds) : ""
  return (
    <div
      data-call-card={state}
      className="mt-1 flex w-full max-w-[560px] items-center gap-3 rounded-xl bg-sunken px-3.5 py-3 text-ui"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
          live ? "bg-camp-moss-tint text-camp-moss-ink" : state === "missed" ? "bg-camp-berry-tint text-camp-berry-ink" : "bg-raised text-ink-2",
        )}
      >
        {state === "missed" ? <PhoneOff /> : <Headphones />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-1.5">
          <span className="font-semibold text-ink">{title}</span>
          {meta && <span data-call-length="" className="text-meta tabular-nums text-ink-3">· {meta}</span>}
        </span>
        {(came.length > 0 || people > 0) && state !== "missed" && (
          <span className="flex min-w-0 items-center gap-2">
            {faces(came)}
            <PeopleLine names={came.map((f) => firstNameOf(f.name) || f.name)} count={people} className="text-meta text-ink-2" />
          </span>
        )}
      </span>
      {live && href && (
        <Button asChild size="sm" className="shrink-0">
          <Link href={href} prefetch={false} onClick={(e) => e.stopPropagation()} aria-label="Join the huddle">Join</Link>
        </Button>
      )}
    </div>
  )
}
