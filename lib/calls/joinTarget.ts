// Where a room's name or a link typed to join a call leads (calls meet-01),
// as Meet's "Enter a code or link" and Zoom's "Join a meeting" take one; a
// room's name is our code. In this app, the member doors (calls HU13) let
// someone in the workspace in as themselves. A call anywhere else opens in a
// tab of its own.

import { tidySlug } from "@/lib/publish/publish"
import { roomDoorPath } from "@/lib/calls/roomDoor"

export type JoinTarget = { path: string } | { url: string }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
// A host and a path with no scheme: "meet.google.com/abc-defg-hij".
const BARE_LINK = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?\//i
// A link's raw token (business/Guest: URL-safe base64).
const TOKEN = /^[A-Za-z0-9_-]+$/

const roomDoor = (slug: string): JoinTarget => ({ path: roomDoorPath(slug) })

/** Where `typed` leads from this app at `origin`; null for what is neither a room's name nor a call. Pure. */
export function joinTarget(typed: string, origin: string): JoinTarget | null {
  const text = typed.trim()
  if (!text) return null
  const link = text.startsWith("/") || SCHEME.test(text) || BARE_LINK.test(text)
  if (!link) {
    const slug = tidySlug(text)
    return slug ? roomDoor(slug) : null
  }
  let url: URL
  try {
    url = new URL(SCHEME.test(text) || text.startsWith("/") ? text : `https://${text}`, origin)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  return url.host === new URL(origin).host ? ownCall(url) : { url: url.href }
}

/** A link in this app that joins a call: a room's address, a meeting's link, or a call's own page. */
function ownCall(url: URL): JoinTarget | null {
  const [first, second, third, ...rest] = url.pathname.split("/").filter(Boolean)
  if (first === "r" && second && !third) {
    let slug: string
    try {
      slug = decodeURIComponent(second)
    } catch {
      return null
    }
    return tidySlug(slug) === slug ? roomDoor(slug) : null
  }
  if (first === "guest" && second === "m" && third && !rest.length && TOKEN.test(third)) return { path: `/app/meet/join/${third}` }
  if (first === "app" && second === "meet" && third) return { path: url.pathname + url.search }
  return null
}
