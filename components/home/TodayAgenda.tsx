"use client"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { displayNameOf } from "@/lib/personName"

/**
 * Today (hub.md H12, H13): the day's events beside what needs you, so the two
 * answers Home exists for sit side by side.
 *
 * A card of rows: time over end, a 3px bar in the event's hue, the title and a
 * meta line ("4 people · starts in 12 min"), and on the right the attendees or
 * Join. The current event sits on the "about you" ground and its own bar shows
 * how far in you are, with a brand dot at now; between events a 1px brand
 * now-line marks the hour. Join comes 10 minutes before an event with a call,
 * quiet until 2 minutes before, then the page's only primary. More than two
 * past events fold under "N earlier"; five rows show, then "N more today".
 * Each event is in its own colour, as the calendar draws it (hueOf). An
 * invitation not yet answered asks "Going?" in its row, with the card's own
 * control and sender (calendar B3a); the answer stays in view once given.
 *
 * Loaded on its own (lazy, app/firstLoad.test.ts): Home's first paint never
 * waits for it.
 */
import Link from "next/link"
import { Fragment, useState, type CSSProperties } from "react"

import { useDispatch } from "react-redux"

import { Button } from "@/components/ui/button"
import { openUI } from "@/store/slice/uiSlice"
import { HubSectionHeader } from "@/components/ui/hubRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { Calendar, ChevronDown, Video } from "@/lib/icons"
import { hueOf, kindOf } from "@/components/calendar/calendarTones"
import { GoingControl } from "@/components/calendar/rsvp/goingControl"
import { sendAnswer } from "@/components/calendar/rsvp/sendAnswer"
import { asksAnswer, eventGuests } from "@/components/calendar/rsvp/eventGuests"
import { useScopePrompt } from "@/components/calendar/scopePrompt"
import { useMyId } from "@/hooks/useMyId"
import { usePost } from "@/hooks/usePost"
import type { Answer } from "@/lib/calendar/eventsApi"
import { cn } from "@/lib/utils/helpers/cn"
import type { CalendarEventInterface } from "@/types/calendar"
import { classifyEvent, eventProgress, eventTitleOf, joinState, planAgenda, whenClause, type EventTime } from "@/components/home/homeTime"
// Its own call (calendar B11), else the link in its notes, as its card has it.
import { eventCallOf } from "@/lib/calendar/joinLink"
import { clockRange, clockTime } from "@/lib/utils/date/clock"
import { useTodayEvents } from "@/components/home/useTodayEvents"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

/** An event's colour on Home, as the calendar draws it: its own hue, and focus time in ink-3 (its bar beside the hatch). */
const todayColour = (ev: CalendarEventInterface) => (kindOf(ev) === "focus" ? "var(--ink-3)" : `var(--camp-${hueOf(ev)})`)

/**
 * "Going?" for the invitations in Today (calendar B3a): the reader's own
 * id, the sender the event card uses (the scope question for an instance of
 * a series, the calendar's copy updated at once), and which rows ask: an
 * invitation still unanswered, kept asking once answered here so the answer
 * stays in view.
 */
function useTodayAnswers(mutate: ReturnType<typeof useTodayEvents>["mutate"]) {
  const post = usePost()
  const selfId = useMyId() || undefined
  const { ask: askScope, prompt } = useScopePrompt()
  const [answeredHere, setAnsweredHere] = useState<string[]>([])
  const asking = (ev: CalendarEventInterface, now: Date) => {
    const guests = eventGuests(ev, selfId)
    if (!asksAnswer(ev, guests, selfId, classifyEvent(ev, now) === "past")) return null
    if (guests.mine !== "needs_action" && !answeredHere.includes(ev.event_uuid)) return null
    return {
      mine: guests.mine,
      onAnswer: async (a: Answer) => {
        setAnsweredHere((ids) => (ids.includes(ev.event_uuid) ? ids : [...ids, ev.event_uuid]))
        return sendAnswer({ post, askScope, mutateEvents: mutate, selfId }, ev, a)
      },
    }
  }
  return { asking, prompt }
}

type Asking = ReturnType<ReturnType<typeof useTodayAnswers>["asking"]>

function Bar({ ev, time, now }: { ev: CalendarEventInterface; time: EventTime; now: Date }) {
  const colour = todayColour(ev)
  if (time === "current") {
    const p = Math.round(eventProgress(ev, now) * 100)
    return (
      <span
        data-agenda-bar="current"
        className="relative h-8 w-[3px] rounded-[2px]"
        style={{ background: `linear-gradient(180deg, ${colour} 0 ${p}%, color-mix(in oklab, ${colour} 35%, transparent) ${p}% 100%)` } as CSSProperties}
      >
        <i className="absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-sheet dark:ring-[#18191C]" style={{ top: `${p}%` }} />
      </span>
    )
  }
  return <span data-agenda-bar={time} className={cn("h-8 w-[3px] rounded-[2px]", time === "past" && "opacity-40")} style={{ background: colour }} />
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="relative h-0" data-now-line="" aria-hidden>
      <div className="pointer-events-none absolute left-[74px] right-3.5 top-[-0.5px] z-[1] h-px bg-[color-mix(in_oklab,var(--brand)_45%,transparent)]">
        <span className="absolute -left-[3px] -top-[2.5px] size-1.5 rounded-full bg-brand" />
        <span className="absolute -top-[15px] right-0 bg-sheet pl-1.5 text-micro font-semibold text-brand-text dark:bg-[#18191C]">
          now {clockTime(now)}
        </span>
      </div>
    </div>
  )
}

function Row({ ev, time, now, asking }: { ev: CalendarEventInterface; time: EventTime; now: Date; asking?: Asking }) {
  const call = eventCallOf(ev, window.location.origin)
  const link = call?.join
  const join = joinState({ ...ev, hasCall: Boolean(link) }, now)
  const people = (ev.event_participants ?? []).filter(Boolean)
  const when = time === "past" ? "" : whenClause(ev, now)
  const meta = ev.event_is_focus
    ? ["Notifications held", when]
    : [people.length > 1 ? `${people.length} people` : people.length === 1 ? `with ${displayNameOf(people[0])}` : "", when]
  return (
    <div
      data-agenda-row={time}
      className={cn(
        "relative grid min-h-[52px] grid-cols-[60px_3px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0",
        time === "current" && "bg-[color-mix(in_oklab,var(--brand-muted)_55%,transparent)] transition-colors duration-[400ms] dark:bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]",
      )}
    >
      <span className="text-meta leading-4 tabular-nums text-ink-3">
        {clockTime(ev.event_start_time)}
        <br />
        {clockTime(ev.event_end_time)}
      </span>
      <Bar ev={ev} time={time} now={now} />
      <span className="min-w-0">
        <span className={cn("block truncate text-ui font-medium", time === "past" && "text-ink-3")}>
          {eventTitleOf(ev)}
        </span>
        <span className="block truncate text-meta text-ink-3">{meta.filter(Boolean).join(" · ")}</span>
      </span>
      {join !== "hidden" && link ? (
        <Button asChild size="sm" variant={join === "secondary" ? "secondary" : "default"} className="hub-pop transition-colors" data-join={join}>
          <a href={link} {...(call?.own ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
            {join === "live" ? <span className="hub-live-dot" aria-hidden /> : <Video />}
            Join
          </a>
        </Button>
      ) : people.length > 0 && time !== "past" ? (
        <span className="flex" aria-label={`${people.length} people`}>
          {people.slice(0, 3).map((p, i) => (
            <span key={p.user_uuid} className={cn("rounded-full ring-2 ring-sheet", i > 0 && "-ml-1.5")}>
              <IdentityMark variant="avatar" size={18} id={avatarSeed(p)} label={displayNameOf(p)} />
            </span>
          ))}
        </span>
      ) : (
        <span />
      )}
      {/* An invitation's "Going?" under its title, across the row: the card is narrow. */}
      {asking ? <GoingControl answer={asking.mine} onAnswer={asking.onAnswer} className="col-span-2 col-start-3" /> : null}
    </div>
  )
}

export function TodayAgenda({ className }: { className?: string }) {
  const dispatch = useDispatch()
  const { events, now, loading, error, unavailable, retry, mutate } = useTodayEvents()
  const [showEarlier, setShowEarlier] = useState(false)
  const { asking, prompt } = useTodayAnswers(mutate)
  if (unavailable) return null
  const plan = planAgenda(events, now)
  const rows = showEarlier ? [...plan.earlier.map((ev) => ({ ev, time: "past" as EventTime })), ...plan.rows] : plan.rows
  const lineAfter = plan.nowLineAfter === null ? null : showEarlier ? plan.nowLineAfter + plan.earlier.length : plan.nowLineAfter

  return (
    <section aria-labelledby="today-title" className={className} data-today-agenda="">
      <HubSectionHeader id="today-title" title="Today" action={<Link href="/app/calendar">Calendar</Link>} />
      {plan.allDay.length > 0 ? (
        <div className="mb-2 flex h-7 flex-wrap items-center gap-1.5">
          {plan.allDay.map((ev) => (
            <span key={ev.event_uuid} className="chip h-[22px]">
              <span className="size-1.5 rounded-full" style={{ background: todayColour(ev) }} />
              {eventTitleOf(ev)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative overflow-hidden rounded-lg bg-sheet shadow-e1 dark:bg-[#18191C]" data-agenda-card="">
        {loading ? (
          [0, 1].map((i) => (
            <div key={i} className="grid min-h-[52px] grid-cols-[60px_3px_1fr] items-center gap-3 border-b border-line px-3.5 last:border-b-0" aria-hidden>
              <span className="h-6 w-9 animate-shimmer rounded-sm bg-press" />
              <span className="h-8 w-[3px] rounded-[2px] bg-press" />
              <span className="h-3 w-3/5 animate-shimmer rounded-sm bg-press" />
            </div>
          ))
        ) : error ? (
          <div className="flex min-h-16 items-center justify-between gap-3 px-3.5 text-ui-sm text-ink-2">
            Couldn&apos;t load today&apos;s events<SaysLoadFailure />
            <Button variant="ghost" size="xs" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 && plan.earlier.length === 0 ? (
          <div className="flex min-h-16 items-center gap-3 px-3.5 py-3" data-agenda-empty="">
            <Tile hue="sky" size="sm">
              <Calendar />
            </Tile>
            <span className="flex-1 text-ui font-medium">Nothing on your calendar today</span>
            <Button variant="ghost" size="xs" onClick={() => dispatch(openUI({ key: "createCalendarEvent" }))}>
              New event
            </Button>
          </div>
        ) : (
          <>
            {plan.earlier.length > 0 && !showEarlier ? (
              <button
                type="button"
                onClick={() => setShowEarlier(true)}
                className="flex h-8 w-full items-center gap-1.5 border-b border-line px-3.5 text-meta text-ink-3 hover:bg-hover hover:text-foreground"
              >
                <ChevronDown className="size-3.5" />
                {plan.earlier.length} earlier
              </button>
            ) : null}
            {lineAfter === -1 ? <NowLine now={now} /> : null}
            {rows.map((r, i) => (
              <Fragment key={r.ev.event_uuid}>
                <Row ev={r.ev} time={r.time} now={now} asking={asking(r.ev, now)} />
                {lineAfter === i ? <NowLine now={now} /> : null}
              </Fragment>
            ))}
            {plan.more > 0 ? (
              <Link href="/app/calendar" className="flex h-8 items-center px-3.5 text-meta text-ink-3 hover:bg-hover hover:text-foreground">
                {plan.more} more today
              </Link>
            ) : null}
          </>
        )}
      </div>
      {prompt}
    </section>
  )
}

/**
 * Today on the phone (H12): a strip of event cards that scrolls sideways, the
 * current one first, with Join as a full-width button inside it.
 */
export function TodayStrip({ className }: { className?: string }) {
  const { events, now, loading, unavailable, mutate } = useTodayEvents()
  const { asking, prompt } = useTodayAnswers(mutate)
  if (unavailable || loading) return null
  const upcoming = events.filter((e) => classifyEvent(e, now) !== "past")
  if (upcoming.length === 0) return null
  return (
    <section aria-labelledby="today-strip-title" className={className} data-today-strip="">
      <HubSectionHeader id="today-strip-title" title="Today" action={<Link href="/app/calendar">Calendar</Link>} />
      {/* The cards snap to the 16px gutter, not the screen's edge (QA SH-15):
          without scroll-padding the first card snapped to x = 0. */}
      <div data-today-scroller="" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {upcoming.map((ev) => {
          const time = classifyEvent(ev, now)
          const call = eventCallOf(ev, window.location.origin)
          const link = call?.join
          const join = joinState({ ...ev, hasCall: Boolean(link) }, now)
          const colour = todayColour(ev)
          const asks = asking(ev, now)
          return (
            <div
              key={ev.event_uuid}
              className={cn(
                "flex w-[248px] shrink-0 snap-start flex-col justify-center gap-1 rounded-lg bg-sheet px-3 py-2.5 shadow-e1 dark:bg-[#18191C]",
                join !== "hidden" || asks ? "min-h-[76px]" : "h-[76px]",
                time === "current" && "bg-[color-mix(in_oklab,var(--brand-muted)_55%,var(--sheet))]",
              )}
              data-agenda-row={time}
            >
              <span className="flex items-center gap-2">
                <span className="h-4 w-[3px] rounded-[2px]" style={{ background: colour }} />
                <span className="text-meta tabular-nums text-ink-3">
                  {clockRange(ev.event_start_time, ev.event_end_time)}
                </span>
              </span>
              <span className="truncate text-ui font-medium">{eventTitleOf(ev)}</span>
              <span className="truncate text-meta text-ink-3">{whenClause(ev, now)}</span>
              {join !== "hidden" && link ? (
                <Button asChild size="sm" variant={join === "secondary" ? "secondary" : "default"} className="mt-1 w-full">
                  <a href={link} {...(call?.own ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
                    <Video />
                    Join
                  </a>
                </Button>
              ) : asks ? (
                <GoingControl answer={asks.mine} onAnswer={asks.onAnswer} touch fill className="mt-1" />
              ) : null}
            </div>
          )
        })}
      </div>
      {prompt}
    </section>
  )
}

export default TodayAgenda
