"use client"
import { displayNameOf } from "@/lib/personName"

/**
 * Home's greeting (hub.md H2, H3): the date, "Good morning, Sam" in the display
 * size, the summary sentence, and the composition beside them. No band: the
 * greeting sits on the sheet and the composition carries the warmth.
 *
 * The orbit is real: the people on today's calendar, then whoever is waiting
 * in your DMs; the agent when AI is on; today's events as dots.
 */
import { useMemo, type ReactNode } from "react"

import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import type { CalendarEventInterface } from "@/types/calendar"
import type { UserDMInterface, UserProfileDataInterface } from "@/types/user"
import { GreetingComposition, type CompositionEvent, type CompositionPerson } from "@/components/home/GreetingComposition"
import { classifyEvent } from "@/components/home/homeTime"
import { clockTime } from "@/lib/utils/date/clock"
import { riseProps } from "@/lib/hub/motion"

/**
 * Up to four people you meet or talk with today: attendees first, then DM
 * partners. People only: an agent or a bot you talk with is no person, and
 * OneCamp AI orbited as a green "OA" disc beside its own agent square. Pure.
 */
export function orbitPeople(events: CalendarEventInterface[], chats: UserDMInterface[], selfId?: string, max = 4): CompositionPerson[] {
  const out: CompositionPerson[] = []
  const seen = new Set<string>()
  const add = (p: UserProfileDataInterface) => {
    const id = p.user_uuid
    if (!id || p.is_bot || id === selfId || seen.has(id) || out.length >= max) return
    seen.add(id)
    out.push({ id, name: displayNameOf(p) || "?" })
  }
  for (const ev of events) for (const p of ev.event_participants ?? []) add(p)
  const waiting = [...chats].sort((a, b) => (b.dm_unread || 0) - (a.dm_unread || 0))
  for (const c of waiting) for (const p of c.dm_participants ?? []) add(p)
  return out
}

/** Today's events as the inner orbit's dots, focus time in dusk. Pure. */
export function orbitEvents(events: CalendarEventInterface[]): CompositionEvent[] {
  return events.slice(0, 3).map((e) => ({ id: e.event_uuid, hue: e.event_is_focus ? "dusk" : hueFor(e.event_uuid) }))
}

/** " · In focus until 16:00" while a focus block runs. Pure. */
export function focusClause(events: CalendarEventInterface[], now: Date): string | null {
  const f = events.find((e) => e.event_is_focus && classifyEvent(e, now) === "current")
  return f ? `In focus until ${clockTime(f.event_end_time)}` : null
}

export function Greeting({
  eyebrow,
  title,
  summary,
  events,
  chats,
  selfId,
  agent,
  now,
  rise,
  phone = false,
  className,
}: {
  eyebrow: string
  title: string
  summary: ReactNode
  events: CalendarEventInterface[]
  chats: UserDMInterface[]
  selfId?: string
  agent: boolean
  now: Date
  rise: boolean
  phone?: boolean
  className?: string
}) {
  const people = useMemo(() => orbitPeople(events, chats, selfId), [events, chats, selfId])
  const dots = useMemo(() => orbitEvents(events), [events])
  const focus = focusClause(events, now)
  const r = (i: number) => riseProps(rise, i)
  return (
    <section aria-label="Your day" data-greeting="" className={cn("flex items-center gap-5", phone ? "min-h-24 items-start" : "h-[168px]", className)}>
      <div className="min-w-0 flex-1">
        <p {...r(0)} className={cn("flex items-center gap-1.5 text-meta font-medium leading-4 text-ink-3", r(0).className)}>
          {eyebrow}
          {focus ? (
            <>
              <span aria-hidden>·</span>
              <span className="size-1.5 rounded-full bg-camp-dusk" aria-hidden />
              {focus}
            </>
          ) : null}
        </p>
        <h1
          {...riseProps(rise, 1, { still: true })}
          data-home-title=""
          className={cn(
            phone ? "text-title-1" : "text-display",
            "mt-1 text-foreground",
            riseProps(rise, 1, { still: true }).className,
          )}
        >
          {title}
        </h1>
        <div {...r(2)} className={cn("mt-2", r(2).className)}>
          {summary}
        </div>
      </div>
      <GreetingComposition
        people={people}
        agent={agent}
        events={dots}
        animate={rise}
        now={now}
        variant={phone ? "phone" : "desktop"}
        className={phone ? "-mt-1" : "-mr-2"}
      />
    </section>
  )
}
