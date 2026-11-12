"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Phone } from "lucide-react"
import { Headphones, PhoneOff } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { PeopleLine } from "@/components/ui/peopleLine"
import { formatElapsed } from "@/components/livekit/callLevels"
import { useNow } from "@/hooks/useNow"
import { firstNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import type { HuddleFace, HuddleFacts } from "@/lib/calls/huddle"
import type { CallSessionRead } from "@/components/livekit/callState"
import { huddleCallOf } from "@/lib/calls/huddleCall"
import type { CallKind } from "@/lib/calls/callRef"
import { callLength } from "@/lib/calls/callLength"

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

/** The card's one action, Join or Call back (Call again): a small button, 44 px tall on touch (DESIGN-BUILD-118 F4). */
const ACTION = "shrink-0 pointer-coarse:min-h-11"

/** "Call Sam back", "Call the group back": Call back's name. Pure. */
export function callBackLabel(caller: string | undefined, group: boolean): string {
  if (group) return "Call the group back"
  const name = firstNameOf(caller ?? "") || caller
  return name ? `Call ${name} back` : "Call back"
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
  /** Who started the call (the post's author), for Call back's name. */
  caller?: string
  /** The reader started it: a missed call reads "No answer" and "Call again". */
  mine?: boolean
  /** A group's call: Call back names the group, not its caller. */
  group?: boolean
}

/**
 * A huddle's card (slack-06), in place of its post's words: on now, a moss
 * mark, who is in it, how long it has run and Join; over, how
 * long it ran and who came; a call nobody answered, "Missed call". It reads
 * nothing itself: the post's facts and the call's read come in as props.
 */
export function CallCard({ facts, read, inChannel, faces, href, caller, mine = false, group = false }: CallCardProps) {
  const { state, came, people } = huddleCardState(facts, read, inChannel)
  const live = state === "live"
  const now = useNow(live)
  const missed = state === "missed"
  const title = live ? "Huddle on now" : missed ? (mine ? "No answer" : "Missed call") : state === "ended" ? "Huddle ended" : "Huddle"
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
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-semibold text-ink">{title}</span>
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
        <Button asChild size="sm" className={ACTION}>
          <Link href={href} prefetch={false} onClick={(e) => e.stopPropagation()} aria-label="Join the huddle">Join</Link>
        </Button>
      )}
      {/* A missed call, in Join's place: the one called calls back, the one who called calls again (slack-06 H2). */}
      {missed && href && (
        <Button asChild size="sm" variant="outline" className={ACTION}>
          <Link href={href} prefetch={false} onClick={(e) => e.stopPropagation()} aria-label={mine ? undefined : callBackLabel(caller, group)}>
            <Phone aria-hidden="true" />
            {mine ? "Call again" : "Call back"}
          </Link>
        </Button>
      )}
    </div>
  )
}

/**
 * A huddle post's card once its call has ended (huddlePost loads it). A missed
 * DM's or group's call offers Call back through its door, as Huddle opens it,
 * to the people it rang, and Call again to the one who started it: the facts'
 * by, written at the call's end (slack-06 H2). A card without by, written
 * before, offers neither, so nobody is offered to call themselves back.
 */
export default function EndedCallCard({ at, self, ...card }: Omit<CallCardProps, "href" | "caller" | "mine" | "group"> & { at?: { kind: CallKind; id: string }; self?: string }) {
  const by = card.facts.by
  const href = card.facts.missed && by && self && at?.kind !== "channel" ? huddleCallOf(at, self)?.href : undefined
  const caller = card.facts.came.find((f) => f.uuid === by)?.name
  return <CallCard {...card} href={href} caller={caller} mine={!!by && by === self} group={at?.kind === "group"} />
}
