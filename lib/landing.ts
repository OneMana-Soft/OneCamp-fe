// Where someone who has just joined the workspace starts.
//
// The server puts a new member in the workspace's default channels as they
// join (#general until an admin chooses others), and answers the sign-up or
// first sign-in with the channel to open on: "landing", a path such as
// /app/channel/<id>?compose=1. compose=1 asks the channel page to put the
// cursor in the message box, so the first thing a new teammate can do is say
// hello, rather than find their way from an empty Home.

/** The address parameter that asks a channel page to focus its message box. */
export const COMPOSE_PARAM = "compose"

/**
 * The server's landing, when it is a page of this app; null for anything else,
 * so an answer can never send someone off the site or to a protocol-relative
 * address. Pure.
 */
export function landingPath(landing: unknown): string | null {
  if (typeof landing !== "string") return null
  if (!landing.startsWith("/app/") || landing.startsWith("//")) return null
  if (/[\\\s]/.test(landing)) return null
  return landing
}

/** Whether an address asks for the message box (compose=1). Pure. */
export function composeRequested(params: URLSearchParams): boolean {
  return params.get(COMPOSE_PARAM) === "1"
}

/** Whether pathname is this channel's own page. Pure. */
export function isChannelPage(pathname: string | null | undefined, channelId: string): boolean {
  return !!channelId && pathname === `/app/channel/${channelId}`
}
