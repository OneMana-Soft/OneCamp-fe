// Call Control on this side (design/calls-vs-zoom/PROGRAM.md §4 #49): who
// runs a call, what each person may do to it, and the actions a screen
// offers. The server decides and checks every action (business/CallControl);
// it tells the room each person's part as two LiveKit attributes only it can
// set, so every screen, a guest's too, draws the controls the server allows.
// Pure, with no LiveKit import, so a test, the People panel and a tile menu
// read it alike.

import { CALL_HOLDS, type CallHold } from "./holds"

/** Someone's part in one call. An invitee is a member in by a call's invite, not in its conversation (HU13). */
export type CallRole = "host" | "cohost" | "participant" | "guest" | "invitee"

/** What someone may do to a call, as the server names it (AbilitiesOf). */
export type CallAbility = "mute" | "mute_all" | "ask_unmute" | "remove" | "lock" | "end" | "cohost" | "spotlight" | "mute_on_entry" | "lower_hands" | "admit" | "hold" | "activities" | "breakouts"

/** The actions the server takes (POST /calls/{session}/act). */
export type CallAction =
  | "mute"
  | "mute_all"
  | "ask_unmute"
  | "ask_all_unmute"
  | "remove"
  | "lock"
  | "unlock"
  | "end"
  | "make_cohost"
  | "remove_cohost"
  | "spotlight"
  | "end_spotlight"
  | "mute_on_entry"
  | "lower_hand"
  | "lower_all_hands"
  // The lobby (CALLS-2).
  | "admit"
  | "deny"
  | "admit_all"
  // What everyone else may do (meet-12): hold one thing for everyone, or let one person through.
  | "hold"
  | "allow"
  // Your own (no ability; guests too): lib/calls/hands.ts.
  | "raise_hand"
  | "set_feedback"
  // The board on the stage (calls package B): boardControls says who may.
  | "present_board"
  | "new_board"
  | "stop_board"
  | "board_draw"
  | "board_guests"
  | "undo_guests"
  // Breakout rooms (calls package C).
  | "breakouts_set"
  | "breakouts_assign"
  | "breakouts_spread"
  | "breakouts_open"
  | "breakouts_close"
  | "breakouts_broadcast"
  | "breakout_choose"

/** The attributes the server sets on each participant. */
export const ROLE_ATTRIBUTE = "oc.role"
export const CAN_ATTRIBUTE = "oc.can"
/** What someone may do although the call holds it, as someone running it let them. */
export const ALLOWED_ATTRIBUTE = "oc.allowed"

const ROLES: readonly CallRole[] = ["host", "cohost", "participant", "guest", "invitee"]
const ABILITIES: readonly CallAbility[] = ["mute", "mute_all", "ask_unmute", "remove", "lock", "end", "cohost", "spotlight", "mute_on_entry", "lower_hands", "admit", "hold", "activities", "breakouts"]

/** Someone's part in the call and what they may do. */
export interface CallPart {
  role: CallRole
  can: ReadonlySet<CallAbility>
  /** What they may do although the call holds it (none when the server hasn't said). */
  allowed?: ReadonlySet<CallHold>
}

/** No part told yet: nothing but your own controls. */
export const NO_PART: CallPart = { role: "participant", can: new Set() }

/** The names in a comma list that are among known, and nothing else. Pure. */
function namesIn<T extends string>(raw: string | undefined, known: readonly T[]): Set<T> {
  const out = new Set<T>()
  for (const a of (raw ?? "").split(",")) {
    const name = a.trim()
    if ((known as readonly string[]).includes(name)) out.add(name as T)
  }
  return out
}

/**
 * Someone's part, from the attributes the server set. Anything it doesn't
 * name grants nothing: an unknown role is a participant, an unknown ability
 * or hold is dropped. Pure.
 */
export function partOf(attributes: Readonly<Record<string, string>> | undefined): CallPart {
  const raw = attributes?.[ROLE_ATTRIBUTE]
  const role = (ROLES as readonly string[]).includes(raw ?? "") ? (raw as CallRole) : "participant"
  return { role, can: namesIn(attributes?.[CAN_ATTRIBUTE], ABILITIES), allowed: namesIn(attributes?.[ALLOWED_ATTRIBUTE], CALL_HOLDS) }
}

/** Whether a part runs the call: what the call holds never holds them. Pure. */
export function runsCall(role: CallRole): boolean {
  return role === "host" || role === "cohost"
}

/**
 * What the call holds for one person: everything held, unless they run the
 * call, less what they were let through. The server's rule (CallControl's
 * mayDo), so a screen disables exactly what the server refuses. Pure.
 */
export function heldFor(held: ReadonlySet<CallHold>, part: Pick<CallPart, "role" | "allowed">): ReadonlySet<CallHold> {
  if (held.size === 0 || runsCall(part.role)) return new Set()
  return new Set([...held].filter((h) => !part.allowed?.has(h)))
}

/** The word beside someone's name for their part, or nothing for most people. Pure. */
export function roleLabel(role: CallRole): string | null {
  if (role === "host") return "Host"
  if (role === "cohost") return "Co-host"
  if (role === "invitee") return "Invited"
  return null
}

const RANK: Record<CallRole, number> = { host: 3, cohost: 2, participant: 1, invitee: 1, guest: 0 }

/** Someone in the call as an action's target. */
export interface CallTarget {
  identity: string
  role: CallRole
  guest: boolean
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
  /** Whether their hand is up. */
  handUp?: boolean
  /** What they may do although the call holds it. */
  allowed?: ReadonlySet<CallHold>
}

/** One thing a screen offers to do to someone. */
export interface PersonAction {
  action: CallAction
  /** For mute: what it turns off. */
  source?: "microphone" | "camera" | "screen_share"
  /** For allow: what it lets them do, or (on false) takes back. */
  what?: CallHold
  on?: boolean
  label: string
  danger?: boolean
}

/** What a held person can be let through, and its words both ways, in a person's menu. */
const LET_THROUGH: readonly { what: CallHold; let: string; stop: string }[] = [
  { what: "microphone", let: "Let them talk", stop: "Stop letting them talk" },
  { what: "share", let: "Let them share", stop: "Stop letting them share" },
]

/**
 * What a screen offers to do to one person in the call, in the order a menu
 * lists them: the same rules the server keeps (nobody acts on someone above
 * them; remove and co-hosts only on someone below; a guest is never made a
 * co-host), so nothing offered is refused for who it is. Your own controls
 * are the dock's. spotlit is who is in the spotlight now, held what the call
 * holds for everyone who doesn't run it. Pure.
 */
export function personActions(me: CallPart & { identity: string }, target: CallTarget, spotlit?: string, held: ReadonlySet<CallHold> = new Set()): PersonAction[] {
  const out: PersonAction[] = []
  const mine = target.identity === me.identity
  const below = RANK[target.role] < RANK[me.role]
  const notAbove = RANK[target.role] <= RANK[me.role]
  if (!mine && notAbove && me.can.has("mute")) {
    if (target.micOn) out.push({ action: "mute", source: "microphone", label: "Mute" })
    if (target.cameraOn) out.push({ action: "mute", source: "camera", label: "Stop video" })
    if (target.sharing) out.push({ action: "mute", source: "screen_share", label: "Stop sharing" })
  }
  // Someone the call's microphone hold covers couldn't act on an ask: they're let talk first (DESIGN-BUILD-19).
  if (!mine && notAbove && me.can.has("ask_unmute") && !target.micOn && !heldFor(held, target).has("microphone")) {
    out.push({ action: "ask_unmute", label: "Ask to unmute" })
  }
  if (!mine && target.handUp && me.can.has("lower_hands")) out.push({ action: "lower_hand", label: "Lower hand" })
  if (!mine && me.can.has("hold") && !runsCall(target.role)) {
    for (const l of LET_THROUGH) {
      if (!held.has(l.what)) continue
      const letThrough = !target.allowed?.has(l.what)
      out.push({ action: "allow", what: l.what, on: letThrough, label: letThrough ? l.let : l.stop })
    }
  }
  if (me.can.has("spotlight")) {
    out.push(spotlit === target.identity ? { action: "end_spotlight", label: "Take out of the spotlight" } : { action: "spotlight", label: "Spotlight for everyone" })
  }
  if (!mine && below && me.can.has("cohost")) {
    if (target.role === "cohost") out.push({ action: "remove_cohost", label: "Remove as co-host" })
    else if (!target.guest) out.push({ action: "make_cohost", label: "Make co-host" })
  }
  if (!mine && below && me.can.has("remove")) out.push({ action: "remove", label: "Remove from call", danger: true })
  return out
}

/** What someone may do about the board on the call's stage (calls package B). */
export interface BoardControls {
  /** Put a board on the stage: they may, sharing is held for them, or someone else's board is up. None for a guest. */
  present: "yes" | "held" | "busy" | null
  /** Take the board on the stage down. */
  stop: boolean
  /** Choose who draws on it, let guests draw, and take back what guests drew. */
  run: boolean
  /** The board on the stage is theirs. */
  mine: boolean
}

/**
 * What someone may do about the board on the call's stage, by the server's
 * own rules (CallControl's boardRefusal), so nothing offered is refused for
 * who they are: a guest does nothing to it; presenting is held with sharing;
 * only the presenter and the people running the call put a board over one
 * that is up, or choose who draws. Taking it down is theirs too, and in a DM
 * or a group anyone's: there everyone has abilities, where elsewhere only
 * those running the call do. Pure.
 */
export function boardControls(me: CallPart & { identity: string }, board: { by: string } | undefined, held: ReadonlySet<CallHold>): BoardControls {
  const mine = !!board && board.by === me.identity
  const runs = runsCall(me.role)
  if (me.role === "guest") return { present: null, stop: false, run: false, mine: false }
  const present = heldFor(held, me).has("share") ? "held" : board && !mine && !runs ? "busy" : "yes"
  return { present, stop: !!board && (mine || me.can.size > 0), run: !!board && (mine || runs), mine }
}

/** One of the switches under "Let everyone" (Meet's words): what it lets everyone do, and whether they may now. */
export interface HoldSwitch {
  what: CallHold
  label: string
  on: boolean
}

const HOLD_SWITCH_LABELS: Record<CallHold, string> = {
  share: "Share their screen",
  chat: "Send chat messages",
  react: "Send reactions",
  microphone: "Turn on their microphone",
  camera: "Turn on their video",
}

/**
 * What the people running a call let everyone else do, as the People panel's
 * switches: none for someone who may not hold, and chat only where the call
 * has a chat (a channel's call: its thread). Pure.
 */
export function holdSwitches(me: CallPart, held: ReadonlySet<CallHold>, hasChat: boolean): HoldSwitch[] {
  if (!me.can.has("hold")) return []
  return CALL_HOLDS.filter((h) => h !== "chat" || hasChat).map((what) => ({ what, label: HOLD_SWITCH_LABELS[what], on: !held.has(what) }))
}

/**
 * The call-wide actions someone may take, for the People panel's header:
 * never asking everyone to unmute while the call holds microphones, which the
 * server refuses (mics_held). Pure.
 */
export function callActions(me: CallPart, state: { locked: boolean; muteOnEntry: boolean; hands?: number; held?: ReadonlySet<CallHold> }): PersonAction[] {
  const out: PersonAction[] = []
  if (me.can.has("lower_hands") && (state.hands ?? 0) > 0) out.push({ action: "lower_all_hands", label: "Lower all hands" })
  if (me.can.has("mute_all")) out.push({ action: "mute_all", label: "Mute all" })
  if (me.can.has("ask_unmute") && !state.held?.has("microphone")) out.push({ action: "ask_all_unmute", label: "Ask all to unmute" })
  if (me.can.has("lock")) out.push(state.locked ? { action: "unlock", label: "Unlock call" } : { action: "lock", label: "Lock call" })
  if (me.can.has("mute_on_entry")) out.push({ action: "mute_on_entry", label: state.muteOnEntry ? "Let people join unmuted" : "Mute people as they join" })
  return out
}
