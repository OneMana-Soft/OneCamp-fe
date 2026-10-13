// What a call says about itself: whether it is recorded or captioned, by
// whom, and where the captioned speech goes. The server writes it into the
// LiveKit room's metadata (and answers it before you join), and every screen
// reads it from here. Pure, with no LiveKit import, so a guest page or the
// green room can use it without the call's bundle.

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

export interface CallMetadata {
  recording: CallRecording
  transcription: CallTranscription
}

/** The green room's read of a call it hasn't joined yet (and the guest link's status). */
export interface CallStateRead {
  room?: string
  active?: boolean
  recording?: { on: boolean; by?: string }
  transcription?: CallTranscription
  participants?: { id: string; name: string }[]
  /** Whether this person may remove others from the call. */
  can_remove?: boolean
  expires_at?: number | string
}

const OFF: CallMetadata = { recording: { on: false }, transcription: { on: false } }

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
  return { recording, transcription: readTranscription(m.transcription) }
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

/** "Captions on · Maya", the pill's words, with the first name only. Pure. */
export function captionsLabel(t: Pick<CallTranscription, "by">): string {
  const first = t.by?.split(" ")[0]
  return first ? `Captions on · ${first}` : "Captions on"
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

export type RemovalReason = "host" | "link_revoked" | "not_member" | "unknown"

export interface CallRemoval {
  reason: RemovalReason
  by?: string
}

/**
 * The server's "you are being removed" packet, or null. Only the server may
 * send it: a packet from another participant is never believed, or anyone
 * could end someone else's call with a message. Pure.
 */
export function readRemovalPacket(payload: Uint8Array, fromParticipant: boolean): CallRemoval | null {
  if (fromParticipant) return null
  try {
    const m = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
    if (m?.t !== "removed") return null
    const reason = m.reason === "host" || m.reason === "link_revoked" || m.reason === "not_member" ? m.reason : "unknown"
    return { reason, by: str(m.by) }
  } catch {
    return null
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
    default:
      return guest
        ? { title: "You were removed from the meeting", detail: "The host removed you from this meeting." }
        : { title: "You were removed from the call", detail: "Someone running the call removed you, so you can't rejoin it." }
  }
}
