import { USER_STATUS_ONLINE } from "@/types/user"

export type Presence = "active" | "away" | "offline"

/** A person's live state as the store keeps it (useUserInfoState): deviceConnected is -1 until it has loaded. */
interface LiveState {
  status?: string
  deviceConnected?: number
}

/** What their profile said when it was read. */
interface ProfileState {
  user_status?: string
  user_device_connected?: number
}

/**
 * Where a person is, one rule for every header that says it (QA F-18): a DM's
 * header said "Offline" on a computer and "Away" on a phone for someone whose
 * status was online with no device connected. Their live state once it has
 * loaded, else their profile: active when online on a device, away when they
 * said so, offline otherwise. Pure.
 */
export function presenceOf(live: LiveState | null | undefined, profile: ProfileState | null | undefined): Presence {
  const loaded = !!live && live.deviceConnected !== -1
  const status = (loaded && live?.status) || profile?.user_status || "offline"
  const devices = (loaded ? live?.deviceConnected : profile?.user_device_connected) ?? 0
  if (status === USER_STATUS_ONLINE && devices > 0) return "active"
  return status === "away" ? "away" : "offline"
}

/** How a presence is said, the same on a computer and a phone. */
export const PRESENCE_WORDS: Record<Presence, string> = { active: "Active", away: "Away", offline: "Offline" }
