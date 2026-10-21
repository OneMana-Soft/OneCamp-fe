// Call Signals (#53): the one reader for the call's data topics. Who sent a
// packet comes from LiveKit, never from a field inside it: captions once
// trusted the speaker a packet claimed, so anyone in a call could put words
// on everyone's screen under someone else's name, and into the in-call AI's
// context (calls audit, CALL-BUG-5's client side). Pure, no LiveKit import.

/** Who may send a signal: the server (no participant), a person, or the transcription agent. */
export type SignalFrom = "server" | "participant" | "agent"

/** The part of a LiveKit participant a signal reader needs. */
export interface SignalSender {
  identity: string
  name?: string
  /** LiveKit's ParticipantKind; 4 is AGENT. */
  kind?: unknown
}

/** The transcription agent's identity in a OneCamp room. */
export const TRANSCRIBER_IDENTITY = "transcriber-bot"
const PARTICIPANT_KIND_AGENT = 4

/** Who sent a packet, from LiveKit's sender alone. Pure. */
export function senderOf(sender: SignalSender | undefined): SignalFrom {
  if (!sender) return "server"
  if (sender.kind === PARTICIPANT_KIND_AGENT || sender.identity === TRANSCRIBER_IDENTITY) return "agent"
  return "participant"
}

/**
 * A data packet on `topic`, parsed, when it came from one of `from`, or null.
 * Pass the topic it arrived on as `received` to have that checked too. Pure.
 */
export function readSignal<T extends object>(
  payload: Uint8Array,
  sender: SignalSender | undefined,
  opts: { topic: string; from: SignalFrom | readonly SignalFrom[]; received?: string },
): T | null {
  if (opts.received !== undefined && opts.received !== opts.topic) return null
  const allowed = Array.isArray(opts.from) ? opts.from : [opts.from]
  if (!allowed.includes(senderOf(sender))) return null
  try {
    const value = JSON.parse(new TextDecoder().decode(payload)) as unknown
    return value && typeof value === "object" ? (value as T) : null
  } catch {
    return null
  }
}

/** A caption line as it is drawn: the speaker is who LiveKit says sent it. */
export interface CaptionLine {
  participantIdentity: string
  participantName: string
  text?: string
  isFinal?: boolean
  id?: string
  [key: string]: unknown
}

/**
 * A caption packet, with its speaker taken from the sender. Only the
 * transcription agent speaks for others (it transcribes everyone in server
 * mode), so only its packets keep the speaker they name. Pure.
 */
export function readCaption(payload: Uint8Array, sender: SignalSender | undefined, received?: string): CaptionLine | null {
  const line = readSignal<Record<string, unknown>>(payload, sender, { topic: "lk.transcription", from: ["participant", "agent"], received })
  if (!line || !sender) return null
  if (senderOf(sender) === "agent") {
    const identity = typeof line.participantIdentity === "string" && line.participantIdentity ? line.participantIdentity : sender.identity
    const name = typeof line.participantName === "string" && line.participantName ? line.participantName : identity
    return { ...line, participantIdentity: identity, participantName: name }
  }
  return { ...line, participantIdentity: sender.identity, participantName: sender.name || sender.identity }
}

/*
 * The call's own signals, between the people in it: one topic, each signal a
 * kind and its payload, from the sender LiveKit names. What a packet says
 * about who sent it counts for nothing (readSignal). The Call State package
 * (#29, shared with chat B7) takes this layer over; until it lands a signal
 * is UI only, and nothing is kept.
 */
export const CALL_SIGNAL_TOPIC = "oc.signal"

export interface CallSignal<P = unknown> {
  kind: string
  payload: P
  from: { identity: string; name: string }
}

/** A signal to send: its kind and payload, as the bytes LiveKit carries. Pure. */
export function encodeSignal(kind: string, payload: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ kind, payload }))
}

/** A signal from a person in the call, on the call's own topic, or null. Pure. */
export function readCallSignal(payload: Uint8Array, sender: SignalSender | undefined, received: string | undefined): CallSignal | null {
  if (received !== CALL_SIGNAL_TOPIC || !sender) return null
  const raw = readSignal<{ kind?: unknown; payload?: unknown }>(payload, sender, { topic: CALL_SIGNAL_TOPIC, from: "participant", received })
  if (!raw || typeof raw.kind !== "string" || !raw.kind) return null
  return { kind: raw.kind, payload: raw.payload ?? null, from: { identity: sender.identity, name: sender.name || sender.identity } }
}

/** What a call can react with, in the tray's order. */
export const CALL_REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "😮"] as const
export type CallReaction = (typeof CALL_REACTIONS)[number]

/** Each reaction's name: its button's, and what the stage's live region says. */
export const REACTION_NAMES: Record<CallReaction, string> = {
  "👍": "Thumbs up",
  "❤️": "Heart",
  "😂": "Laughing",
  "🎉": "Celebrate",
  "👏": "Clapping",
  "😮": "Surprised",
}

/**
 * A reaction from a person in the call. Only an emoji the tray offers is
 * read, so a packet never puts words or markup on everyone's stage. Pure.
 */
export function readReaction(payload: Uint8Array, sender: SignalSender | undefined, received: string | undefined): { emoji: CallReaction; identity: string; name: string } | null {
  const s = readCallSignal(payload, sender, received)
  if (!s || s.kind !== "reaction") return null
  const emoji = (s.payload as { emoji?: unknown } | null)?.emoji
  if (typeof emoji !== "string" || !(CALL_REACTIONS as readonly string[]).includes(emoji)) return null
  return { emoji: emoji as CallReaction, ...s.from }
}
