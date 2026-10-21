// Call Control on this side (design/calls-vs-zoom/PROGRAM.md §4 #49): who
// runs a call, what each person may do to it, and the actions a screen
// offers. The server decides and checks every action (business/CallControl);
// it tells the room each person's part as two LiveKit attributes only it can
// set, so every screen, a guest's too, draws the controls the server allows.
// Pure, with no LiveKit import, so a test, the People panel and a tile menu
// read it alike.

/** Someone's part in one call. */
export type CallRole = "host" | "cohost" | "participant" | "guest"

/** What someone may do to a call, as the server names it (AbilitiesOf). */
export type CallAbility = "mute" | "mute_all" | "ask_unmute" | "remove" | "lock" | "end" | "cohost" | "spotlight" | "mute_on_entry"

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

/** The attributes the server sets on each participant. */
export const ROLE_ATTRIBUTE = "oc.role"
export const CAN_ATTRIBUTE = "oc.can"

const ROLES: readonly CallRole[] = ["host", "cohost", "participant", "guest"]
const ABILITIES: readonly CallAbility[] = ["mute", "mute_all", "ask_unmute", "remove", "lock", "end", "cohost", "spotlight", "mute_on_entry"]

/** Someone's part in the call and what they may do. */
export interface CallPart {
  role: CallRole
  can: ReadonlySet<CallAbility>
}

/** No part told yet: nothing but your own controls. */
export const NO_PART: CallPart = { role: "participant", can: new Set() }

/**
 * Someone's part, from the attributes the server set. Anything it doesn't
 * name grants nothing: an unknown role is a participant, an unknown ability
 * is dropped. Pure.
 */
export function partOf(attributes: Readonly<Record<string, string>> | undefined): CallPart {
  const raw = attributes?.[ROLE_ATTRIBUTE]
  const role = (ROLES as readonly string[]).includes(raw ?? "") ? (raw as CallRole) : "participant"
  const can = new Set<CallAbility>()
  for (const a of (attributes?.[CAN_ATTRIBUTE] ?? "").split(",")) {
    const name = a.trim()
    if ((ABILITIES as readonly string[]).includes(name)) can.add(name as CallAbility)
  }
  return { role, can }
}

/** The word beside someone's name for their part, or nothing for most people. Pure. */
export function roleLabel(role: CallRole): string | null {
  if (role === "host") return "Host"
  if (role === "cohost") return "Co-host"
  return null
}

const RANK: Record<CallRole, number> = { host: 3, cohost: 2, participant: 1, guest: 0 }

/** Someone in the call as an action's target. */
export interface CallTarget {
  identity: string
  role: CallRole
  guest: boolean
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
}

/** One thing a screen offers to do to someone. */
export interface PersonAction {
  action: CallAction
  /** For mute: what it turns off. */
  source?: "microphone" | "camera" | "screen_share"
  label: string
  danger?: boolean
}

/**
 * What a screen offers to do to one person in the call, in the order a menu
 * lists them: the same rules the server keeps (nobody acts on someone above
 * them; remove and co-hosts only on someone below; a guest is never made a
 * co-host), so nothing offered is refused for who it is. Your own controls
 * are the dock's. spotlit is who is in the spotlight now. Pure.
 */
export function personActions(me: CallPart & { identity: string }, target: CallTarget, spotlit?: string): PersonAction[] {
  const out: PersonAction[] = []
  const mine = target.identity === me.identity
  const below = RANK[target.role] < RANK[me.role]
  const notAbove = RANK[target.role] <= RANK[me.role]
  if (!mine && notAbove && me.can.has("mute")) {
    if (target.micOn) out.push({ action: "mute", source: "microphone", label: "Mute" })
    if (target.cameraOn) out.push({ action: "mute", source: "camera", label: "Stop video" })
    if (target.sharing) out.push({ action: "mute", source: "screen_share", label: "Stop sharing" })
  }
  if (!mine && notAbove && me.can.has("ask_unmute") && !target.micOn) out.push({ action: "ask_unmute", label: "Ask to unmute" })
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

/** The call-wide actions someone may take, for the People panel's header. Pure. */
export function callActions(me: CallPart, state: { locked: boolean; muteOnEntry: boolean }): PersonAction[] {
  const out: PersonAction[] = []
  if (me.can.has("mute_all")) out.push({ action: "mute_all", label: "Mute all" })
  if (me.can.has("ask_unmute")) out.push({ action: "ask_all_unmute", label: "Ask all to unmute" })
  if (me.can.has("lock")) out.push(state.locked ? { action: "unlock", label: "Unlock call" } : { action: "lock", label: "Lock call" })
  if (me.can.has("mute_on_entry")) out.push({ action: "mute_on_entry", label: state.muteOnEntry ? "Let people join unmuted" : "Mute people as they join" })
  return out
}
