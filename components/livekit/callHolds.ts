// What the people running a call hold for everyone else, on this side (calls
// meet-12, zoom-14): the server's word when a hold changes or someone is let
// through, and what a control the call holds says. Read in the call only (the
// notices, the dock, the chat and the reactions), so none of it rides on the
// green room's or a door's first load. Pure.

import { CALL_HOLDS, type CallHold } from "@/lib/calls/holds"
import { readSignal, type SignalSender } from "@/lib/calls/signals"
import { CALL_TOPIC } from "./callState"

/**
 * The server's word on a hold: changed for everyone ("held", on or off), or
 * one person let through it or no longer ("allowed", sent to them alone).
 */
export interface HoldPacket {
  t: "held" | "allowed"
  by?: string
  what: CallHold
  on: boolean
}

/**
 * A hold packet, or null. Only the server may send one (lib/calls/signals):
 * from a participant it is never believed, or anyone could tell the room a
 * host turned chat off. Pure.
 */
export function readHoldPacket(payload: Uint8Array, sender: SignalSender | undefined): HoldPacket | null {
  const m = readSignal<Record<string, unknown>>(payload, sender, { topic: CALL_TOPIC, from: "server" })
  if (m?.t !== "held" && m?.t !== "unheld" && m?.t !== "allowed" && m?.t !== "disallowed") return null
  if (!(CALL_HOLDS as readonly unknown[]).includes(m.source)) return null
  const by = typeof m.by === "string" && m.by.trim() ? m.by.trim() : undefined
  const t = m.t === "held" || m.t === "unheld" ? "held" : "allowed"
  return { t, by, what: m.source as CallHold, on: m.t === "held" || m.t === "allowed" }
}

/** What a hold is called: "turned off screen sharing for everyone". */
const NOUN: Record<CallHold, string> = { share: "screen sharing", chat: "chat", react: "reactions", microphone: "microphones", camera: "video" }

/** Where a hold comes in the summary: microphones and video first, so a cut line keeps them (DESIGN-BUILD-19, 26 Oct). */
const SAID: Record<CallHold, number> = { microphone: 0, camera: 1, share: 2, chat: 3, react: 4 }

/** What the call holds for everyone, in one line, for whoever runs it: "Off for everyone: microphones, chat". Pure. */
export function heldSummary(off: readonly CallHold[]): string {
  return off.length === 0 ? "Nothing is turned off" : `Off for everyone: ${[...off].sort((a, b) => SAID[a] - SAID[b]).map((h) => NOUN[h]).join(", ")}`
}

/** What a hold stops someone doing, said of everyone, of you, and of one person by name. */
const VERB: Record<CallHold, { everyone: string; you: string; them: string }> = {
  share: { everyone: "share their screen", you: "share your screen", them: "share their screen" },
  chat: { everyone: "send chat messages", you: "send chat messages", them: "send chat messages" },
  react: { everyone: "send reactions", you: "send reactions", them: "send reactions" },
  microphone: { everyone: "turn on their microphone", you: "talk", them: "talk" },
  camera: { everyone: "turn on their video", you: "turn on your video", them: "turn on their video" },
}

/**
 * What someone reads when a hold changes for everyone, or for them alone: who
 * did it, and what it means. What to do about it is only for someone it holds
 * (holdsYou): not whoever runs the call, nor someone let through. Pure.
 */
export function holdNotice(p: HoldPacket, holdsYou: boolean): { title: string; detail?: string } {
  const who = p.by ?? "Someone running the call"
  if (p.t === "allowed") return { title: p.on ? `${who} let you ${VERB[p.what].you}` : `${who} stopped letting you ${VERB[p.what].you}` }
  if (!p.on) return { title: `${who} let everyone ${VERB[p.what].everyone} again` }
  const title = `${who} turned off ${NOUN[p.what]} for everyone`
  return holdsYou && NEXT[p.what] ? { title, detail: NEXT[p.what] } : { title }
}

/** Why a control is off for you while the call holds it, said on the control and where you'd type. Pure. */
export function heldReason(what: CallHold): string {
  return what === "chat" ? "The people running the call have turned off chat for now." : `The people running the call have turned off ${NOUN[what]}.`
}

/** What someone a hold holds can do about it, where there's something: said by the hold's notice and by a press of the held control. */
const NEXT: Partial<Record<CallHold, string>> = { microphone: "Raise your hand to ask to talk.", chat: "You can still read it." }

/** What to do about a hold, or nothing. Pure. */
export const heldNext = (what: CallHold): string | undefined => NEXT[what]

/** What someone reads on joining a call that holds their microphone, their camera or both: they're off, and why. Pure. */
export function joinHeldNotice(mic: boolean, camera: boolean): { title: string; description: string } {
  if (mic && camera) {
    return { title: "You joined with your microphone and camera off", description: "The people running this call have turned off microphones and video. Raise your hand to ask to talk." }
  }
  if (mic) return { title: "You joined muted", description: "The people running this call have turned off microphones. Raise your hand to ask to talk." }
  return { title: "You joined with your camera off", description: "The people running this call have turned off video." }
}

/** What letting one person through a hold did, for whoever did it. Pure. */
export function letThroughDone(what: CallHold, name: string | undefined, on: boolean): string {
  return `${name ?? "They"} ${on ? "can" : "can't"} ${VERB[what].them} now`
}

/** The publish permission the call server gave someone, as LiveKit keeps it. */
export interface PublishPermission {
  canPublish?: boolean
  canPublishSources?: readonly unknown[]
}

/**
 * Whether the call server lets someone publish a source now (source as its
 * permission names it): a call's holds are left out of each person's
 * permission, and an empty list is every source. The truth at the moment of
 * joining, before the room has been told anyone's part. Pure.
 */
export function mayPublish(permission: PublishPermission | undefined, source: unknown): boolean {
  if (!permission) return true
  if (permission.canPublish === false) return false
  return !permission.canPublishSources?.length || permission.canPublishSources.includes(source)
}
