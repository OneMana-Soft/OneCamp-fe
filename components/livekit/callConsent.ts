// A person's answer to a recording or captions notice (zoom-09): OK or Leave
// call, kept by the server as an audit row of who agreed to what was on. Each
// writes only their own: a member by their session, a guest by the call token
// they joined with (Asker). The server decides who they are and checks what
// they answered against what is on now (409 notice_stale: nothing written).

import { backendFetch } from "@/lib/http/backendFetch"
import { publicCall } from "@/services/publicApi"
import { readCallMetadata } from "./callState"
import type { Asker } from "./handsRunner"

export type ConsentChoice = "accepted" | "left"

/** What a notice asked about, from the room's metadata as it's answered: the recording's egress id ("" while none runs or before it lands) and the captions' session while they're on, else 0. Pure. */
export function consentOf(metadata: string | null | undefined): { recording: string; transcript: number } {
  const m = readCallMetadata(metadata)
  return { recording: m.recording.on ? (m.recording.egressId ?? "") : "", transcript: m.transcription.on ? (m.transcription.since ?? 0) : 0 }
}

/**
 * How long a post is waited for: far past a slow answer, short enough that a
 * guest who pressed OK is still there to read "try again" (the eight seconds
 * of lib/auth/probe). A server that took the connection and never answers
 * otherwise left their OK seeming to do nothing.
 */
const ANSWER_WAIT_MS = 8_000

/**
 * Posts body as the asker: a member to their session's calls/{id}/{what}, a
 * guest to /guest/calls/{what} by their call token. Whether the server took
 * it within ANSWER_WAIT_MS; never throws. keepalive outlives the page.
 */
export async function postAsAsker(asker: Asker, what: string, body: string, keepalive = false): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(ANSWER_WAIT_MS)
    if ("sessionId" in asker) {
      const res = await backendFetch(`calls/${encodeURIComponent(asker.sessionId)}/${what}`, { method: "POST", body, keepalive, signal, headers: { "Content-Type": "application/json" } })
      return res.ok
    }
    return (await publicCall(`/guest/calls/${what}`, { method: "POST", body, keepalive, signal, headers: { Authorization: `Bearer ${asker.callToken}` } })).ok
  } catch {
    return false
  }
}

/** Keeps the asker's answer to what the room shows now; a Leave outlives the page. Whether it was kept. */
export const recordConsent = (asker: Asker, choice: ConsentChoice, metadata: string | null | undefined) =>
  postAsAsker(asker, "consent", JSON.stringify({ choice, ...consentOf(metadata) }), choice === "left")

/** Leaves once kept settles, or after wait at most (a Leave is kept before the disconnect, which would refuse it); once. */
export function leaveAfter(kept: Promise<unknown>, leave: () => void, wait = 1500): void {
  let gone = false
  const go = () => {
    if (gone) return
    gone = true
    clearTimeout(timer)
    leave()
  }
  const timer = setTimeout(go, wait)
  kept.then(go, go)
}
