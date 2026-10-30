// A call's polls and questions as the call hears of them, its panel shut or
// open (calls package A, "Ask the room": meet-10, zoom-02): the server's word
// that something changed, and whether the dock says so. Pure and small, since
// it rides on the call's first load; the panel and its reads load when it opens.

import { readSignal, type SignalSender } from "@/lib/calls/signals"
import { CALL_TOPIC } from "./callState"

/**
 * What changed, where the server says (business/CallControl's told): a poll
 * started, its results shared, Q&A changed, a question asked. null is a vote,
 * an upvote, a close or a question marked, which only an open panel reads.
 * It never says who.
 */
export type ActivitiesTold = "poll" | "results" | "qa" | "question" | null

const TOLD: readonly string[] = ["poll", "results", "qa", "question"]

/**
 * An activities packet, as what it says changed, or undefined for any other
 * packet. Only the server may send one (lib/calls/signals): from a
 * participant it is never believed, or anyone could light everyone's dock.
 * Pure.
 */
export function readActivitiesPacket(payload: Uint8Array, sender: SignalSender | undefined): { what: ActivitiesTold } | undefined {
  const m = readSignal<Record<string, unknown>>(payload, sender, { topic: CALL_TOPIC, from: "server" })
  if (m?.t !== "activities") return undefined
  return { what: typeof m.what === "string" && TOLD.includes(m.what) ? (m.what as ActivitiesTold) : null }
}

/**
 * Whether a change lights the dock's Polls and Q&A while its panel is shut:
 * a poll starting, results shared or Q&A changing, for everyone; a question
 * asked, for whoever runs the call, who answers it. Pure.
 */
export function lightsDock(what: ActivitiesTold, runs: boolean): boolean {
  return what === "poll" || what === "results" || what === "qa" || (what === "question" && runs)
}
