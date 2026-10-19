// What a failed request says to the person using the app.
//
// Every failure used to raise "In-App Error" with axios's own message beneath it
// ("Request failed with status code 403"), which names the machinery, not the
// problem. The server's message, written for people, still wins when there is
// one; otherwise the status decides the words.

import { recentKeys } from "./recentKeys"

interface ErrorCopy {
  title: string
  description: string
}

const BY_STATUS: Record<number, ErrorCopy> = {
  400: { title: "That didn't work", description: "Something in the request wasn't accepted. Check it and try again." },
  403: { title: "Not allowed", description: "You don't have permission to do that." },
  404: { title: "Not found", description: "It may have been deleted or moved." },
  409: { title: "Already changed", description: "Someone changed this at the same time. Refresh and try again." },
  413: { title: "Too large", description: "That is larger than this workspace allows." },
  429: { title: "Too many requests", description: "Wait a moment and try again." },
}

const SERVER_TROUBLE: ErrorCopy = { title: "Something went wrong", description: "The server hit a problem. Try again in a moment." }
const UNKNOWN: ErrorCopy = { title: "Something went wrong", description: "Try again in a moment." }

// Server messages that say only "no", in the dozen spellings handlers use. The
// status's own words say it better ("You don't have permission to do that").
const BARE = /^(not authori[sz]ed|unauthori[sz]ed|forbidden|not allowed)\.?$/i

// Server messages that give no reason, only that something failed: a failed
// refresh in chat said "Something went wrong · internal error". The status's
// own words are written for people ("The server hit a problem. Try again in a
// moment.").
const NO_REASON = /^(internal( server)? error|server error|unknown error|an? (unexpected |unknown )?error( occurred)?|something went wrong|error|failed)\.?$/i

// A server fault's developer text: "Failed to create comment", "failed to
// update field". It names what broke inside, not what the person can do, so
// a 5xx never shows it (QA DSA-15).
const DEVELOPER_TEXT = /^failed to\b/i

/**
 * The title for the public demo's refusals (code "demo"). The server says why
 * in its message: everyone who opens the demo is the same account, so it keeps
 * its own channels and docs, and connects nobody's personal accounts. Under
 * "Not allowed" that read as a permission the visitor lacked, not as the
 * demo looking after the next visitor.
 */
export const DEMO_REFUSAL_TITLE = "The demo is shared"

// A 503 that says why (the calendar moving to its one store) is a refusal for
// now, not a fault.
const UNAVAILABLE_TITLE = "Not available right now"

/**
 * What a status means in the person's words, for a failure the server sent no
 * words for; undefined for a status with none of its own. Pure.
 */
export function statusWords(status: number): string | undefined {
  if (BY_STATUS[status]) return BY_STATUS[status].description
  if (status >= 500) return SERVER_TROUBLE.description
  return undefined
}

/**
 * Whether a server's message is worth showing for a failure with this status
 * (0 for none): it says something, and more than a bare "no" or a bare "it
 * failed", which the status's own words say better; and from a server fault
 * (5xx) it isn't the server's developer text ("Failed to create comment").
 * Pure.
 */
export function saysWhy(msg: string, status: number): boolean {
  const m = msg.trim()
  if (!m || BARE.test(m) || NO_REASON.test(m)) return false
  return !(status >= 500 && DEVELOPER_TEXT.test(m))
}

/** The copy for a failed request. serverMsg is the backend's own msg field, code its machine-readable code. Pure. */
export function errorToastCopy(status: number | undefined, serverMsg: unknown, code?: unknown): ErrorCopy {
  const base = (status && BY_STATUS[status]) || (status && status >= 500 ? SERVER_TROUBLE : UNKNOWN)
  const msg = typeof serverMsg === "string" ? serverMsg.trim() : ""
  if (!saysWhy(msg, status ?? 0)) return base
  return { title: code === "demo" ? DEMO_REFUSAL_TITLE : status === 503 ? UNAVAILABLE_TITLE : base.title, description: msg }
}

/** Whether a failed request is the demo explaining itself, whose words are best left as they are. Pure. */
export function isDemoRefusal(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { code?: unknown }).code === "demo"
}

// One screen can make several requests that fail the same way at once (a page
// of admin cards, say) and each used to raise its own identical toast.
const shown = recentKeys(4000)

/** Whether this copy was already shown moments ago. Records it when not. */
export function shownRecently(copy: ErrorCopy, now: number = Date.now()): boolean {
  return shown.seen(`${copy.title}\n${copy.description}`, now)
}
