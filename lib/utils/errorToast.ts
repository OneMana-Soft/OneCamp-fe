// What a failed request says to the person using the app.
//
// Every failure used to raise "In-App Error" with axios's own message beneath it
// ("Request failed with status code 403"), which names the machinery, not the
// problem. The server's message, written for people, still wins when there is
// one; otherwise the status decides the words.

export interface ErrorCopy {
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

/** The copy for a failed request. serverMsg is the backend's own msg field. Pure. */
export function errorToastCopy(status: number | undefined, serverMsg: unknown): ErrorCopy {
  const base = (status && BY_STATUS[status]) || (status && status >= 500 ? SERVER_TROUBLE : UNKNOWN)
  const msg = typeof serverMsg === "string" ? serverMsg.trim() : ""
  return msg ? { title: base.title, description: msg } : base
}

// One screen can make several requests that fail the same way at once (a page
// of admin cards, say) and each used to raise its own identical toast.
const DEDUPE_MS = 4000
const lastShown = new Map<string, number>()

/** Whether this copy was already shown moments ago. Records it when not. */
export function shownRecently(copy: ErrorCopy, now: number = Date.now()): boolean {
  const key = `${copy.title}\n${copy.description}`
  const at = lastShown.get(key)
  if (at !== undefined && now - at < DEDUPE_MS) return true
  lastShown.set(key, now)
  return false
}
