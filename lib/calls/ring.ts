import { firstNameOf } from "@/lib/personName"
import { huddleCallOf } from "@/lib/calls/huddleCall"
import { isCallPane, paneFromHref, type CallPaneKind, type Pane } from "@/lib/split"
import type { CallKind } from "@/lib/calls/callRef"
import type { CallSessionRead } from "@/components/livekit/callState"

// Ring in DMs (slack-06 H2): what MESSAGE_CALL_RING (49) says on the person's
// own activity topic, and what the web makes of it. Pure: the listener
// (useMqttMessageHandler) passes each message on as CALL_RING_EVENT, the
// ring host reduces it here, and the card and the caller's stage only draw.

/** The window event the MQTT handler raises for each MESSAGE_CALL_RING (it writes the name itself). */
export const CALL_RING_EVENT = "onecamp:call-ring"

export interface RingPerson {
  uuid: string
  name: string
  /** Their picture's object key. */
  profile?: string
}

/** One MESSAGE_CALL_RING, read. */
export interface RingMessage {
  state: "ring" | "stop" | "declined" | "ringing"
  session: string
  caller?: RingPerson
  resource?: { kind: "dm" | "group"; uuid: string }
  /** When the ring stops by itself, in ms. */
  until?: number
  quiet?: boolean
  by?: RingPerson
  people?: (RingPerson & { quiet?: boolean })[]
}

/** A ring the callee's card shows. */
export interface Ring {
  session: string
  caller: RingPerson
  resource: { kind: "dm" | "group"; uuid: string }
  until: number
  quiet: boolean
}

/**
 * The rings shown now, newest first, and the calls that no longer ring here
 * (stopped, hidden, declined or over) with the ring_until they rang to: a late
 * copy of that ring stays away, and a Ring again, which rings to a later one,
 * rings.
 */
export interface RingsState {
  rings: Ring[]
  gone: { session: string; until: number }[]
}

export type RingAction =
  | { type: "message"; msg: RingMessage; now: number; inCall?: string }
  | { type: "hide"; session: string }
  | { type: "tick"; now: number }

export const NO_RINGS: RingsState = { rings: [], gone: [] }

const str = (v: unknown) => (typeof v === "string" && v ? v : "")

function personOf(v: unknown): RingPerson | null {
  const p = v as Record<string, unknown> | null
  if (!p || typeof p !== "object" || !str(p.uuid)) return null
  const out: RingPerson = { uuid: str(p.uuid), name: str(p.name) || "Someone" }
  if (str(p.profile)) out.profile = str(p.profile)
  return out
}

/** A MESSAGE_CALL_RING's data, read; null for anything else. Pure. */
export function readRingMessage(v: unknown): RingMessage | null {
  const m = v as Record<string, unknown> | null
  if (!m || typeof m !== "object" || !str(m.session)) return null
  const session = str(m.session)
  const until = Date.parse(str(m.ring_until))
  switch (m.state) {
    case "stop":
      return { state: "stop", session }
    case "declined": {
      const by = personOf(m.by)
      return by ? { state: "declined", session, by } : null
    }
    case "ringing": {
      if (!Number.isFinite(until) || !Array.isArray(m.people)) return null
      const people = m.people.flatMap((x) => {
        const p = personOf(x)
        return p ? [(x as { quiet?: unknown }).quiet === true ? { ...p, quiet: true } : p] : []
      })
      return { state: "ringing", session, until, people }
    }
    case "ring": {
      const caller = personOf(m.caller)
      const r = m.resource as { kind?: unknown; uuid?: unknown } | null
      const kind = r?.kind === "dm" || r?.kind === "group" ? r.kind : null
      if (!caller || !kind || !str(r?.uuid) || !Number.isFinite(until)) return null
      return { state: "ring", session, caller, resource: { kind, uuid: str(r?.uuid) }, until, quiet: m.quiet === true }
    }
  }
  return null
}

/** How many calls that no longer ring are kept, to keep a late copy of their ring away. */
const GONE_KEPT = 20

/** How long the server rings a call (business/Chat RingFor). */
const RING_MS = 30_000

const gone = (s: RingsState, went: RingsState["gone"]): RingsState => {
  if (!went.length) return s
  const ids = went.map((g) => g.session)
  const kept = went.map((g) => ({ session: g.session, until: Math.max(g.until, s.gone.find((o) => o.session === g.session)?.until ?? 0) }))
  return { rings: s.rings.filter((r) => !ids.includes(r.session)), gone: [...kept, ...s.gone.filter((g) => !ids.includes(g.session))].slice(0, GONE_KEPT) }
}

/** The callee's rings after a message, a hide (Escape, a swipe down, Accept or Decline) or a tick of the clock. Pure. */
export function ringsReduce(s: RingsState, a: RingAction): RingsState {
  const held = (session: string) => s.rings.filter((r) => r.session === session)
  if (a.type === "hide") return gone(s, held(a.session))
  if (a.type === "tick") return gone(s, s.rings.filter((r) => r.until <= a.now))
  const m = a.msg
  // A stop with no ring held (the starter's own app as the call starts) keeps the server's ring away.
  if (m?.state === "stop") return gone(s, held(m.session).length ? held(m.session) : [{ session: m.session, until: a.now + RING_MS }])
  if (m?.state !== "ring" || !m.caller || !m.resource || m.until === undefined) return s
  if (m.until <= a.now || m.session === a.inCall || m.until <= (s.gone.find((g) => g.session === m.session)?.until ?? -Infinity)) return s
  const ring: Ring = { session: m.session, caller: m.caller, resource: m.resource, until: m.until, quiet: m.quiet === true }
  const rest = s.rings.filter((r) => r.session !== m.session)
  return { ...s, rings: rest.length === s.rings.length ? [ring, ...rest] : s.rings.map((r) => (r.session === m.session ? ring : r)) }
}

/** What a caller's ringing call shows of each person: ringing, declined or didn't answer. Those in the call are gone from it. */
export type FaceState = "ringing" | "declined" | "no_answer"

export interface RingingFace extends RingPerson {
  state: FaceState
}

/** The caller's ring: whom it rings until when, and who declined. */
export interface CallerRing {
  session: string
  until: number
  people: RingPerson[]
  declined: string[]
}

/** The caller's ring after a message about their call ("ringing" or "declined"). Pure. */
export function callerReduce(s: CallerRing | null, msg: RingMessage): CallerRing | null {
  if (msg.state === "ringing" && msg.until !== undefined) {
    return { session: msg.session, until: msg.until, people: (msg.people ?? []).map(({ uuid, name, profile }) => (profile ? { uuid, name, profile } : { uuid, name })), declined: [] }
  }
  if (msg.state !== "declined" || !msg.by || !s || s.session !== msg.session || s.declined.includes(msg.by.uuid)) return s
  return { ...s, declined: [...s.declined, msg.by.uuid] }
}

/** Each person the caller's ring rang, at now, but those in the call. Pure. */
export function facesAt(ring: CallerRing, now: number, inCall: string[]): RingingFace[] {
  const inside = new Set(inCall.map((id) => id.toLowerCase()))
  return ring.people
    .filter((p) => !inside.has(p.uuid.toLowerCase()))
    .map((p) => ({ ...p, state: ring.declined.includes(p.uuid) ? "declined" : now >= ring.until ? "no_answer" : "ringing" }))
}

/** The caller's line: a headline, a muted summary of the settled ones, and whether "Ring again" shows (every face settled). Pure. */
export function ringSummary(faces: RingingFace[]): { headline: string; summary: string; settled: boolean } {
  const settled = faces.length > 0 && faces.every((f) => f.state !== "ringing")
  if (faces.length === 1) {
    const [f] = faces
    const name = firstNameOf(f.name) || f.name
    if (f.state === "declined") return { headline: `${name} declined`, summary: "", settled }
    if (f.state === "no_answer") return { headline: `${name} didn't answer`, summary: "", settled }
    return { headline: `Ringing ${name}…`, summary: "Up to 30 seconds", settled }
  }
  const declined = faces.filter((f) => f.state === "declined").length
  const missed = faces.filter((f) => f.state === "no_answer").length
  const summary = [declined ? `${declined} declined` : "", missed ? `${missed} didn't answer` : ""].filter(Boolean).join(" · ")
  return { headline: settled ? "Nobody picked up" : `Ringing ${faces.length} people…`, summary, settled }
}


/** The call's door a ring's Accept opens, as its Huddle button does: a DM's call by its caller (the page names the other person), a group's by the group. Pure. */
export function ringDoor(ring: Ring, self?: string): string {
  const at = ring.resource.kind === "dm" ? { kind: "chat" as const, id: ring.caller.uuid } : { kind: "group" as const, id: ring.resource.uuid }
  return huddleCallOf(at, self)?.href ?? ""
}

/** The call on screen: the call page's (pane -1), else the first call beside the page (its pane); null for none. Pure. */
export function callOnScreen(pathname: string, panes: readonly Pane[]): { at: { kind: CallKind; id: string }; pane: number } | null {
  const page = paneFromHref(pathname)
  const pane = page && isCallPane(page) ? -1 : panes.findIndex(isCallPane)
  const p = pane === -1 ? page : panes[pane]
  return p && isCallPane(p) ? { at: { kind: CALL_KIND[p.kind], id: p.id }, pane } : null
}

const CALL_KIND: Record<CallPaneKind, CallKind> = { "call-channel": "channel", "call-chat": "chat", "call-group": "group" }

/** The call you are in, from its read (GET /calls/current): its session's id while it is on with you in it; "" otherwise (its green room is not in it). Pure. */
export function sessionYouAreIn(read: CallSessionRead | undefined, self: string | undefined): string {
  const s = read?.live ? read.session : null
  if (!s?.id || !self) return ""
  return s.people.some((p) => p.in_call && (p.user_uuid || p.identity) === self) ? s.id : ""
}

/** A group's name and size, as its conversation's read gives them. */
export interface RingGroup {
  name?: string
  people?: number
}

const groupLabel = (g: RingGroup | undefined) => g?.name?.trim() || ""

/** The card's line under the name: "Calling you", "Calling Launch crew · 5 people", "Calling a group of 5"; and " · You're in a call" while you are in another. Pure. */
export function ringLine(ring: Ring, group: RingGroup | undefined, inCall: boolean): string {
  const name = groupLabel(group)
  const n = group?.people
  const where = ring.resource.kind === "dm" ? "Calling you" : name ? `Calling ${name}${n ? ` · ${n} people` : ""}` : n ? `Calling a group of ${n}` : "Calling a group"
  return inCall ? `${where} · You're in a call` : where
}

/** What the card says aloud, once: "Maya Rao is calling you", "Maya Rao is calling Launch crew". Pure. */
export function ringSaid(ring: Ring, group: RingGroup | undefined): string {
  const where = ring.resource.kind === "dm" ? "you" : groupLabel(group) || "a group"
  return `${ring.caller.name} is calling ${where}`
}

/** Decline's or Ring again's refusal in words, never a code; "" for anything else (a lost Decline says nothing: its caller sees "didn't answer"). Pure. */
export function ringRefusal(status: number | undefined, code: string | undefined): string {
  if (status === 404) return "That call is over."
  if (code === "in_call") return "You're already in that call."
  if (code === "not_in_call") return "Join the call to ring again."
  if (code === "still_ringing") return "It's still ringing."
  if (code === "ring_limit") return "This call can't ring anyone again."
  return ""
}

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/** Whether a ring's card may take the focus: nothing editable has it (a keystroke mid-sentence must never accept a call) and no dialog is open. */
export function mayTakeFocus(doc: Document): boolean {
  const at = doc.activeElement
  if (at && at !== doc.body && at.closest(EDITABLE)) return false
  return !doc.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]')
}
