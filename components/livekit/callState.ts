// What a call says about itself: whether it is recorded or captioned, by
// whom, and where the captioned speech goes. The server writes it into the
// LiveKit room's metadata (and answers it before you join), and every screen
// reads it from here. Pure, with no LiveKit import, so a guest page or the
// green room can use it without the call's bundle.

import { readSignal, type SignalSender } from "@/lib/calls/signals"

/** Where captioned speech is turned into text: the CALLS-FE ↔ CALLS-BE contract's `where`. */
export type TranscriptionWhere = "browser" | "server" | "deepgram" | "google" | "openai" | "custom"

/**
 * The call's one switch for captions (CALL-BUG-2): whether speech is turned
 * into text at all, by whom it was turned on, where the speech goes, and
 * whether the text is kept as the call's transcript. The server writes it;
 * nothing runs until somebody deliberately turns it on.
 */
export interface CallTranscription {
  on: boolean
  /** Who turned it on (or, when off, who turned it off), by the name people see. */
  by?: string
  byId?: string
  since?: number
  where?: TranscriptionWhere | string
  /** Final lines are stored as the call's transcript. False in an instant meeting: captions only. */
  kept?: boolean
}

export interface CallRecording {
  on: boolean
  by?: string
  egressId?: string
}

/** Who locked the call, so nobody new can join it, and when (unix ms). */
export interface CallLock {
  by?: string
  since?: number
}

/** Who is in everyone's spotlight, and who put them there. */
export interface CallSpotlight {
  identity: string
  by?: string
}

export interface CallMetadata {
  recording: CallRecording
  transcription: CallTranscription
  /** What the people running the call set (business/CallControl). */
  locked?: CallLock
  spotlight?: CallSpotlight
  /** People join this call muted. */
  muteOnEntry: boolean
}

/** A guest link's read of its meeting, and an instant meeting's own page. */
export interface CallStateRead {
  room?: string
  active?: boolean
  recording?: { on: boolean; by?: string }
  transcription?: CallTranscription
  participants?: { id: string; name: string }[]
  expires_at?: number | string
}

/** Someone in a call, as a member's read of it says (GET /calls/current). */
export interface CallSessionPerson {
  identity: string
  user_uuid?: string
  name: string
  role: string
  guest?: boolean
  in_call: boolean
}

/**
 * A member's read of a call (GET /calls/current): whether one is going on,
 * the call itself, what is switched on in it, and the reader's own part,
 * with why the call won't let them in now when it won't.
 */
export interface CallSessionRead {
  live: boolean
  session: { id: string; people: CallSessionPerson[]; locked?: { by: string } | null } | null
  recording?: { on: boolean; by?: string }
  transcription?: CallTranscription
  you?: { role?: string; can: string[]; refusal?: { code: string; msg: string } }
}

/** The people in a call now, from a member's read, for the green room's line. Pure. */
export function peopleOfSession(read: CallSessionRead | undefined): CallStateRead["participants"] {
  return read?.session?.people.filter((p) => p.in_call).map((p) => ({ id: p.identity, name: p.name }))
}

const OFF: CallMetadata = { recording: { on: false }, transcription: { on: false }, muteOnEntry: false }

/**
 * Who is in the call, for the green room's line. The server names a guest
 * "Guest: Priya" (their LiveKit name), and the line takes first names, so it
 * read "Guest: is in the call". Pure.
 */
export function peopleInCall(participants: CallStateRead["participants"]): { id: string; name: string }[] | undefined {
  return participants?.map((p) => ({ id: p.id, name: p.name.replace(/^Guest:\s*/, "") || "Guest" }))
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

/** A transcription object from the server, read; anything but on:true is off. Pure. */
export function readTranscription(v: unknown): CallTranscription {
  if (!v || typeof v !== "object") return { on: false }
  const c = v as Record<string, unknown>
  const common = { by: str(c.by), byId: str(c.byId), since: typeof c.since === "number" ? c.since : undefined }
  if (c.on !== true) return { on: false, ...common }
  return { on: true, ...common, where: str(c.where), kept: c.kept !== false }
}

/**
 * The room's metadata, read: recording (the keys the server has always
 * written) and transcription. Anything malformed reads as off, the safe side:
 * nothing is transcribed on a guess. Pure.
 */
export function readCallMetadata(raw: string | null | undefined): CallMetadata {
  if (!raw) return OFF
  let m: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return OFF
    m = parsed as Record<string, unknown>
  } catch {
    return OFF
  }
  const recording: CallRecording = m.isRecording === true ? { on: true, by: str(m.recordingStartedBy), egressId: str(m.egressID) } : { on: false }
  const meta: CallMetadata = { recording, transcription: readTranscription(m.transcription), muteOnEntry: m.muteOnEntry === true }
  if (m.locked && typeof m.locked === "object") {
    const l = m.locked as Record<string, unknown>
    meta.locked = { by: str(l.by), since: typeof l.since === "number" ? l.since : undefined }
  }
  if (m.spotlight && typeof m.spotlight === "object") {
    const id = str((m.spotlight as Record<string, unknown>).identity)
    if (id) meta.spotlight = { identity: id, by: str((m.spotlight as Record<string, unknown>).by) }
  }
  return meta
}

/**
 * Where captioned speech goes, said to each person about their own voice,
 * and whether the words are kept. Browser mode names the destination, as the
 * coordinator asked (CALL-BUG-2): each browser sends its own speaker's audio
 * to its maker's speech service. Pure.
 */
export function captionsWhereText(t: Pick<CallTranscription, "where" | "kept">): string {
  const kept = t.kept === false ? "The text isn't kept after the call." : "The text is kept as this call's transcript."
  switch (t.where ?? "browser") {
    case "browser":
      return `What you say goes to your browser's speech service (Google in Chrome, Microsoft in Edge). ${kept}`
    case "server":
      return `What you say is transcribed on this workspace's own server. ${kept}`
    case "deepgram":
      return `What you say is sent to Deepgram to be transcribed. ${kept}`
    case "google":
      return `What you say is sent to Google Cloud to be transcribed. ${kept}`
    case "openai":
      return `What you say is sent to OpenAI to be transcribed. ${kept}`
    default:
      return `What you say is sent to the speech-to-text service this workspace set up. ${kept}`
  }
}

/**
 * What the person turning captions on reads first (CALL-BUG-2): that it
 * reaches everyone, and where everyone's speech goes. Pure.
 */
export function captionsConfirmText(t: Pick<CallTranscription, "where" | "kept">): string {
  const kept = t.kept === false ? "The text isn't kept after the call." : "The text is kept as this call's transcript."
  const where: Record<string, string> = {
    browser: "What each person says goes to their browser's speech service (Google in Chrome, Microsoft in Edge).",
    server: "What each person says is transcribed on this workspace's own server.",
    deepgram: "What each person says is sent to Deepgram to be transcribed.",
    google: "What each person says is sent to Google Cloud to be transcribed.",
    openai: "What each person says is sent to OpenAI to be transcribed.",
  }
  const said = where[t.where ?? "browser"] ?? "What each person says is sent to the speech-to-text service this workspace set up."
  return `Everyone in the call is told, and can stop their own voice being captioned. ${said} ${kept}`
}

/**
 * The pill's words, with the first name only: "Transcript on · Maya" while
 * the words are kept as the call's transcript, "Captions on · Maya" when they
 * are only shown (an instant meeting). A pill that said captions while a
 * transcript was being kept undersold what was happening. Pure.
 */
export function captionsLabel(t: Pick<CallTranscription, "by" | "kept">): string {
  const what = t.kept === false ? "Captions on" : "Transcript on"
  const first = t.by?.split(" ")[0]
  return first ? `${what} · ${first}` : what
}

/**
 * The language to recognise speech in (CALL-BUG-2): the workspace's, when an
 * admin set one, else the person's own, from the browser's first preference.
 * Never a fixed en-US: someone speaking Hindi or German got English guesses.
 * Undefined leaves it to the browser. Pure.
 */
export function speechLanguage(
  workspace?: string,
  nav: { languages?: readonly string[]; language?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator,
): string | undefined {
  return str(workspace) ?? str(nav?.languages?.[0]) ?? str(nav?.language)
}

/** The language a join sends the server, for its agent (BCP-47, at most 35 characters). Pure. */
export function joinLanguage(nav?: { languages?: readonly string[]; language?: string }): string | undefined {
  return speechLanguage(undefined, nav)?.slice(0, 35)
}

// --- Removed from a call (CALL-BUG-11) ---

/** The data topic the server uses to tell one person why they are leaving. */
export const CALL_TOPIC = "oc.call"

// unconfirmed: whether they may be in the call couldn't be checked as they
// connected, so the server put them out rather than let them stay (fail
// closed, 21 Oct); they can join again once it can be.
export type RemovalReason = "host" | "link_revoked" | "not_member" | "locked" | "unconfirmed" | "ended" | "unknown"

export interface CallRemoval {
  reason: RemovalReason
  by?: string
}

/**
 * The server's "you are being removed" packet, or null. Only the server may
 * send it (lib/calls/signals): a packet from a participant is never believed,
 * or anyone could end someone else's call with a message. Pure.
 */
export function readRemovalPacket(payload: Uint8Array, sender: SignalSender | undefined): CallRemoval | null {
  const m = readSignal<Record<string, unknown>>(payload, sender, { topic: CALL_TOPIC, from: "server" })
  if (m?.t !== "removed") return null
  const reason = m.reason === "host" || m.reason === "link_revoked" || m.reason === "not_member" || m.reason === "locked" || m.reason === "unconfirmed" ? m.reason : "unknown"
  return { reason, by: str(m.by) }
}

/**
 * What the server tells one person, or everyone, about the call
 * (business/CallControl): someone running it muted you, asked you to unmute,
 * gave you a part in it, or ended it for everyone.
 */
export type CallControlPacket =
  | { t: "muted"; by?: string; source: "microphone" | "camera" | "screen_share"; all: boolean }
  | { t: "ask_unmute"; by?: string; all: boolean }
  | { t: "role"; role: "host" | "cohost" | "participant"; by?: string; handedOn: boolean }
  | { t: "ended"; by?: string }

/**
 * The server's word on what happened to you in the call, or null. Only the
 * server may send it (lib/calls/signals): a packet from a participant is
 * never believed, or anyone could mute your screen or end your call with a
 * message. Pure.
 */
export function readControlPacket(payload: Uint8Array, sender: SignalSender | undefined): CallControlPacket | null {
  const m = readSignal<Record<string, unknown>>(payload, sender, { topic: CALL_TOPIC, from: "server" })
  if (!m || typeof m.t !== "string") return null
  const by = str(m.by)
  switch (m.t) {
    case "muted": {
      const source = m.source === "camera" || m.source === "screen_share" ? m.source : "microphone"
      return { t: "muted", by, source, all: m.reason === "all" }
    }
    case "ask_unmute":
      return { t: "ask_unmute", by, all: m.reason === "all" }
    case "role":
      if (m.role !== "host" && m.role !== "cohost" && m.role !== "participant") return null
      return { t: "role", role: m.role, by, handedOn: m.reason === "handed_on" }
    case "ended":
      return { t: "ended", by }
  }
  return null
}

/**
 * What a person reads when the server tells them something about the call:
 * who did it, and what they can do now. Pure.
 */
export function controlNotice(p: CallControlPacket): { title: string; detail?: string } {
  const who = p.by ?? "Someone running the call"
  switch (p.t) {
    case "muted":
      if (p.source === "camera") return { title: `${who} turned off your camera`, detail: "Turn it back on when you're ready." }
      if (p.source === "screen_share") return { title: `${who} stopped your screen share` }
      return p.all
        ? { title: `${who} muted everyone`, detail: "Unmute when you want to speak." }
        : { title: `${who} muted you`, detail: "Unmute when you want to speak." }
    case "ask_unmute":
      return { title: `${who} asks you to unmute`, detail: "Your microphone stays off unless you turn it on." }
    case "role":
      if (p.handedOn) return { title: "You're the host now", detail: "The people running the call left, so it's yours to run." }
      if (p.role === "cohost") return { title: `${who} made you a co-host`, detail: "You can now mute, remove and lock for everyone." }
      if (p.role === "host") return { title: `${who} made you a host` }
      return { title: `${who} removed you as a co-host` }
    case "ended":
      return { title: `${who} ended the call for everyone` }
  }
}

/**
 * What the removed person reads: why, and whether they can come back in. A
 * member removed by a host can't rejoin that call; a guest's link may still
 * open (the host turns it off to keep them out), so a guest isn't told
 * otherwise. Pure.
 */
export function removedText(r: CallRemoval | null, guest = false): { title: string; detail: string } {
  switch (r?.reason) {
    case "host":
      if (guest) {
        return { title: "You were removed from the meeting", detail: r.by ? `${r.by} removed you from this meeting.` : "The host removed you from this meeting." }
      }
      return {
        title: "You were removed from the call",
        detail: r.by ? `${r.by} removed you, so you can't rejoin this call.` : "The host removed you, so you can't rejoin this call.",
      }
    case "link_revoked":
      return { title: "Your invite was turned off", detail: "The link you joined with no longer works, so you can't rejoin this call." }
    case "not_member":
      return { title: "You left the call", detail: "You're no longer a member of this conversation, so you can't rejoin its call." }
    case "unconfirmed":
      return {
        title: guest ? "You left the meeting" : "You left the call",
        detail: `We couldn't confirm you can be in this ${guest ? "meeting" : "call"} just now. Join again in a moment.`,
      }
    case "locked":
      return guest
        ? { title: "This meeting is locked", detail: "Its host locked it before you got in, so nobody new can join. Ask them to unlock it." }
        : { title: "This call is locked", detail: "Someone running it locked it before you got in, so nobody new can join. Ask them to unlock it." }
    case "ended":
      return {
        title: guest ? "The meeting has ended" : "The call has ended",
        detail: r.by ? `${r.by} ended it for everyone.` : "It was ended for everyone.",
      }
    default:
      return guest
        ? { title: "You were removed from the meeting", detail: "The host removed you from this meeting." }
        : { title: "You were removed from the call", detail: "Someone running the call removed you, so you can't rejoin it." }
  }
}
