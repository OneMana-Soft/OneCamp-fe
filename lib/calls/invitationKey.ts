// An event invitee's own key on the way to the event's call (meet-02): the
// guest's page links "Join call" to the call's address with the key in the
// fragment, and the room's page reads it back to send with the join, so they
// come in without knocking. A fragment never reaches a server, a log or a
// Referer, and the room's page drops it from the address once read. Pure.

const NAME = "invitation"

/** The event's call at address, carrying the invitee's key: "/r/weekly-sync-1a2b#invitation=<key>". */
export function callWithInvitation(address: string, key: string): string {
  return key ? `${address}#${NAME}=${encodeURIComponent(key)}` : address
}

/** The invitee's key in a page's fragment ("#invitation=<key>"), or undefined. */
export function invitationIn(hash: string): string | undefined {
  const key = new URLSearchParams(hash.replace(/^#/, "")).get(NAME)?.trim()
  return key ? key : undefined
}
