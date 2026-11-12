/**
 * "Why did or didn't I get this?" in words (A4 H3): the Notification Router's
 * answers, POST /notify/test and GET /notify/why/{message}, said plainly.
 * Read only by the lazy panel and Send me a test (components/notifications,
 * in the notifications settings' lazy chunk) and their tests, so none of it
 * rides on a first load. Neither answer carries
 * a message's body; the place's name is the Inbox row's own.
 */

import { isAppOffline } from "@/lib/connectivity"
import { clockTime } from "@/lib/utils/date/clock"

/** "chat.mention", "calendar.invited", "notify.test", … (business/Notify/contract.go). */
export type Cause = string
/** "inbox", "badge", "push", "desktop", "email" or "sound". */
export type Delivery = string

export interface WhyStep {
  step: string
  verdict: string
  causes?: Cause[]
}

export interface WhyDecision {
  user_id?: string
  cause?: Cause
  to?: Delivery[]
  held?: Delivery[]
  hold_till?: string
}

/** One delivery as it stands now: sent, held (until hold_until), dropped (held, then its message deleted) or retracted (sent, then deleted). */
export interface DeliveryState {
  delivery: Delivery
  state: string
  hold_until?: string
  at: string
}

export interface WhyTrace {
  user_id: string
  event_id: string
  steps: WhyStep[]
  decision?: WhyDecision
  deliveries?: DeliveryState[]
}

export interface TestAnswer extends WhyTrace {
  devices: { push_devices: number; push_known: boolean; apps_open: number; apps_known: boolean }
  told: Delivery[]
}

/** The asker's own record of one message: each event about it that reached them, newest first. */
export interface WhyAnswer {
  events: WhyTrace[]
}

/** Where a request stands; each has words of its own. */
export type NotifyState<T> =
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "empty" }
  | { status: "too_soon"; retryAt: string }
  | { status: "demo" }
  | { status: "no_record" }
  | { status: "offline" }
  | { status: "error" }

type Answer = { status?: number; data?: { code?: string; retry_at?: string }; headers?: Record<string, string | undefined> }

/** A failed request in its own words: too soon (until when), the demo, no record, offline, or an error. */
export function failureOf(error: unknown, now = Date.now()): Exclude<NotifyState<never>, { status: "done" | "loading" | "empty" }> {
  const res = (error as { response?: Answer } | null)?.response
  if (!res) return isAppOffline() ? { status: "offline" } : { status: "error" }
  if (res.status === 429) {
    const after = Number(res.headers?.["retry-after"])
    return { status: "too_soon", retryAt: res.data?.retry_at || new Date(now + (after > 0 ? after : 60) * 1000).toISOString() }
  }
  if (res.status === 403 && res.data?.code === "demo") return { status: "demo" }
  if (res.status === 404) return { status: "no_record" }
  return { status: "error" }
}

export type Tone = "ok" | "held" | "off"

const CAUSES: Record<string, string> = {
  "chat.dm": "it's a direct message to you",
  "chat.mention": "you were mentioned",
  "chat.reply_to_you": "someone replied to you",
  "chat.reply": "it's a reply in a thread you follow",
  "chat.team": "a team you're in was mentioned",
  "chat.keyword": "it has one of your keywords",
  "chat.broadcast": "@here, @channel or @everyone reached everyone there",
  "chat.message": "you hear about every message there",
  "chat.reaction": "someone reacted to your message",
  "chat.call": "a huddle started where you are",
  "calendar.invited": "you were asked to an event",
  "calendar.updated": "an event you're on changed",
  "calendar.cancelled": "an event you're on was cancelled",
  "calendar.rsvp": "a guest answered your invitation",
  "calendar.reminder": "an event you're on starts soon",
  "calendar.booking": "someone booked, moved or cancelled time with you",
  "notify.test": "you asked for a test",
}

/** Why it reached them, as the end of "Because …": "you were mentioned". */
export function causeWords(cause: Cause | undefined): string {
  if (cause && CAUSES[cause]) return CAUSES[cause]
  if (cause?.startsWith("calendar.")) return "it's about your calendar"
  return "it matched one of your notification settings"
}

const words = (raw: string) => {
  const w = raw.replace(/_/g, " ")
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const DELIVERIES: Record<string, string> = {
  inbox: "Inbox",
  badge: "Badge",
  push: "Push",
  desktop: "Desktop notice",
  email: "Email",
  sound: "Sound",
}

export const deliveryName = (d: Delivery) => DELIVERIES[d] ?? words(d)

/** A time on the reader's clock: "7:00 AM" today, "Mon 7:00 AM" this week, "12 Nov, 7:00 AM" further off. */
export function clockWords(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "later"
  const time = clockTime(d)
  if (d.toDateString() === now.toDateString()) return time
  if (Math.abs(d.getTime() - now.getTime()) < 6 * 86_400_000) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`
}

const HOLDS: Record<string, string> = {
  quiet_hours: "Held by your quiet hours",
  paused: "Held while your notifications are paused,",
  focus: "Held by your focus time",
}

/**
 * One step's verdict as a sentence, and its tone: "ok" let it on, "held"
 * kept it back for now, "off" stopped it. `place` is the Inbox row's
 * ("#launch", "a direct message"); `holdTill` is the decision's.
 */
export function stepWords(s: WhyStep, place: string, holdTill?: string): { words: string; tone: Tone } {
  const until = holdTill ? ` until ${clockWords(holdTill)}.` : "."
  const v = s.verdict
  switch (s.step) {
    case "audience":
      if (v === "site") return { words: "It was for you alone, as a test.", tone: "ok" }
      if (v === "in") return { words: "It was meant for you.", tone: "ok" }
      if (v === "actor") return { words: "You did it yourself, so it didn't notify you.", tone: "off" }
      return { words: "It wasn't meant for you.", tone: "off" }
    case "access":
      if (v === "in_place") return { words: place.startsWith("#") ? `You're in ${place}.` : "You're in this conversation.", tone: "ok" }
      return { words: "You can't see where it was posted, so it didn't notify you.", tone: "off" }
    case "cause":
      return { words: `The reason that counted: ${causeWords(s.causes?.[0])}.`, tone: "ok" }
    case "preference":
      if (v === "kept") return { words: "Your notification settings let it through.", tone: "ok" }
      if (v === "broadcast_in_thread") return { words: "@here and @channel don't notify inside a thread.", tone: "off" }
      if (v === "thread_setting") return { words: "Your thread setting kept it quiet.", tone: "off" }
      return { words: "Your notification level for this place kept it quiet.", tone: "off" }
    case "hold":
      if (v === "not_held") return { words: "Nothing held it back.", tone: "ok" }
      if (v === "nothing_to_hold") return { words: "Nothing to hold: it only went where it can't interrupt you.", tone: "ok" }
      if (v.startsWith("held:") && HOLDS[v.slice(5)]) return { words: `${HOLDS[v.slice(5)]}${until}`, tone: "held" }
      if (v.startsWith("held")) return { words: holdTill ? `Held by your schedule${until}` : "Held back by your schedule.", tone: "held" }
      return { words: `${words(v)}.`, tone: "ok" }
    default:
      return { words: `${words(s.step)}: ${v.replace(/_/g, " ")}.`, tone: "ok" }
  }
}

/** A delivery's state now: "Sent 6:31 AM", "Held until 7:00 AM", … */
export function deliveryStateWords(d: DeliveryState): { words: string; tone: Tone } {
  switch (d.state) {
    case "sent":
      return { words: d.at ? `Sent ${clockWords(d.at)}` : "Sent", tone: "ok" }
    case "held":
      return { words: d.hold_until ? `Held until ${clockWords(d.hold_until)}` : "Held", tone: "held" }
    case "dropped":
      return { words: "Not sent: the message was deleted while it was held", tone: "off" }
    case "retracted":
      return { words: "Taken back: the message was deleted", tone: "off" }
    default:
      return { words: words(d.state), tone: "ok" }
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Where a test can show: devices with push on, and OneCamp open (which shows a desktop notice). */
export function devicesWords(d: TestAnswer["devices"]): { words: string; tone: Tone }[] {
  const push: { words: string; tone: Tone } = !d.push_known
    ? { words: "We couldn't check your devices for push.", tone: "off" }
    : d.push_devices > 0
      ? { words: `Push is on for ${count(d.push_devices, "device", "devices")}.`, tone: "ok" }
      : { words: "No device has push turned on.", tone: "off" }
  const apps: { words: string; tone: Tone } = !d.apps_known
    ? { words: "We couldn't check where OneCamp is open.", tone: "off" }
    : d.apps_open > 0
      ? { words: `OneCamp is open in ${count(d.apps_open, "app or tab", "apps or tabs")}, so a desktop notice shows there.`, tone: "ok" }
      : { words: "OneCamp isn't open anywhere right now, so no desktop notice can show.", tone: "off" }
  return [push, apps]
}

/** A test's deliveries: what was told now, then what the schedule held. */
export function testDeliveries(a: TestAnswer): DeliveryState[] {
  const held = a.decision?.held ?? []
  return [
    ...a.told.map((delivery) => ({ delivery, state: "sent", at: "" })),
    ...held.map((delivery) => ({ delivery, state: "held", hold_until: a.decision?.hold_till, at: "" })),
  ]
}

/** Each state but an answer: its heading and its line. */
export function stateWords(kind: "test" | "why", state: Exclude<NotifyState<unknown>, { status: "done" }>, now = new Date()): { title: string; line: string } {
  switch (state.status) {
    case "loading":
      return kind === "test" ? { title: "Send me a test", line: "Sending a test…" } : { title: "Why am I seeing this?", line: "Looking it up…" }
    case "offline":
      return { title: "You're offline", line: "Connect, then try again." }
    case "error":
      return { title: "Something went wrong", line: kind === "test" ? "Couldn't send a test. Try again." : "Couldn't look that up. Try again." }
    case "too_soon":
      return kind === "test"
        ? { title: "One test a minute", line: `You can send the next one at ${clockWords(state.retryAt, now)}.` }
        : { title: "Too many lookups", line: `Try again at ${clockWords(state.retryAt, now)}.` }
    case "demo":
      return {
        title: "Not in the demo",
        line: "Everyone shares this demo account, so a test would reach every visitor's devices. Install OneCamp to try it on yours.",
      }
    case "no_record":
      return { title: "No record", line: "There's no record of how this reached you." }
    case "empty":
      return { title: "Nothing recorded", line: "Nothing was recorded about how this reached you." }
  }
}

/** A test's heading: sent, held, or neither. */
export function testTitle(a: TestAnswer): string {
  if (a.told.length) return "Test sent"
  if (a.decision?.held?.length) return "Test held"
  return "Nothing was sent"
}
