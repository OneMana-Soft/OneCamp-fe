import { publicCall } from "@/services/publicApi"

// Where a guest comes into a meeting (calls CALLS-2): a link's token, or a personal room's address and its passcode's unlock.
// invitation: an event invitee's own key (meet-02), sent when they join so they come in without knocking.
export type GuestDoor = { path: string; k?: string; invitation?: string }

export const linkDoor = (token: string): GuestDoor => ({ path: `/guest/meet/${encodeURIComponent(token)}` })

export const roomDoor = (slug: string, k?: string, invitation?: string): GuestDoor => ({
  path: `/public/r/${encodeURIComponent(slug)}`,
  ...(k ? { k } : {}),
  ...(invitation ? { invitation } : {}),
})

/** A door's path for what follows it ("/join"), with its unlock and query. Pure. */
export function doorPath(door: GuestDoor, rest = "", query: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams(door.k ? { k: door.k } : {})
  for (const [key, value] of Object.entries(query)) if (value) q.set(key, value)
  const s = q.toString()
  return door.path + rest + (s ? `?${s}` : "")
}

/** What a meeting's door answers its guest page. */
export const getGuestMeetingStatus = (door: GuestDoor) => publicCall<{ available?: boolean; state?: string; workspace_name?: string }>(doorPath(door))

/** A room's address as people are sent it ("/r/maya" on this app's origin); "" for none. */
export const roomLink = (address: string, origin = typeof window !== "undefined" ? window.location.origin : "") => (address ? origin + address : "")
