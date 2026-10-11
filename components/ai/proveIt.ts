/**
 * The agents record in words, and "Prove it" (hub.md AI14, AI15). Pure.
 *
 * recordLines()  what a record row says: the object on line 1 ("post in
 *                #drill-finance") and why on line 2 ("you are not a member of
 *                this channel"), with the outcome as a tag;
 * verifyChain()  checks that every entry the reader can see links to the one
 *                before it: an entry's prev_hash must be the entry_hash of the
 *                entry with the sequence number one lower. "Verified" here means
 *                exactly that, the hash chain, and never anything about law or
 *                compliance (onecamp-ai-act-record-keeping).
 */
import type { AIActivityItem } from "@/services/aiActivityService"

export type RecordOutcome = "done" | "refused" | "failed" | "waiting" | "running" | "attempt" | null

export interface RecordLines {
  verb: string
  object: string
  why: string
  outcome: RecordOutcome
}

const REFUSED = /^(?:Drill:\s*)?(.+?)\s+refused\s*\((.+)\)\s*$/i
const ATTEMPT = /^(?:Drill:\s*)?an agent acting for \S+ is about to attempt (?:a |an )?(.+)$/i

export function outcomeOf(it: AIActivityItem): RecordOutcome {
  switch (it.status) {
    case "succeeded":
    case "allowed":
      return "done"
    case "refused":
      return "refused"
    case "failed":
      return "failed"
    case "running":
      return "running"
    case "awaiting_approval":
    case "pending":
      return "waiting"
    default:
      return it.title?.endsWith(".attempt") ? "attempt" : null
  }
}

export function recordLines(it: AIActivityItem): RecordLines {
  const outcome = outcomeOf(it)
  const summary = (it.summary || "").trim()
  const refused = REFUSED.exec(summary)
  if (refused) return { verb: "tried to", object: refused[1], why: refused[2], outcome: "refused" }
  const attempt = ATTEMPT.exec(summary)
  if (attempt) return { verb: "is about to try", object: attempt[1], why: "the permission check runs first, and is written down before it", outcome: "attempt" }
  if (it.kind === "agent_run") {
    return {
      verb: it.status === "running" ? "is working" : "ran",
      object: "",
      why: summary || (it.source ? `started by ${it.source}` : ""),
      outcome,
    }
  }
  return { verb: "acted as you", object: summary.replace(/^Drill:\s*/i, ""), why: it.source ? `${it.source}` : "", outcome }
}

export interface ChainCheck {
  /** Every visible link held. */
  ok: boolean
  /** How many links were checked (pairs of consecutive entries both on screen). */
  links: number
  /** How many entries carry a position in the chain. */
  entries: number
  /** The first entry whose prev_hash does not match the entry before it. */
  brokenSeq?: number
}

export function verifyChain(items: AIActivityItem[]): ChainCheck {
  const chained = items.filter((i) => typeof i.seq === "number" && i.entry_hash && i.prev_hash !== undefined)
  const bySeq = new Map(chained.map((i) => [i.seq as number, i]))
  let links = 0
  let brokenSeq: number | undefined
  for (const seq of [...bySeq.keys()].sort((a, b) => a - b)) {
    const before = bySeq.get(seq - 1)
    if (!before) continue
    links++
    if (bySeq.get(seq)!.prev_hash !== before.entry_hash && brokenSeq === undefined) brokenSeq = seq
  }
  return { ok: brokenSeq === undefined, links, entries: chained.length, brokenSeq }
}
