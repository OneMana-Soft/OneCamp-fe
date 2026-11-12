// The recorder's way into a call's room (H3, meet-17). LiveKit's egress opens
// the backend's recording address, which sends it on to /call-recording-layout
// with a short recorder token in the address's FRAGMENT: #lk=<LiveKit URL>&t=<token>.
// A fragment reaches no server, no request log and no referrer. The page reads
// it once and puts the bare path back; a token in the query is never read.

export type RecorderTicket = { url: string; token: string }

/** The ticket in an address's fragment, or null: no fragment, no token, or a LiveKit address that isn't ws(s). Pure. */
export function readRecorderTicket(hash: string): RecorderTicket | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""))
  const url = q.get("lk") ?? ""
  const token = q.get("t") ?? ""
  if (!token || !/^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(url)) return null
  return { url, token }
}
