/**
 * The presence dot (design v3 §3.9, hub.md P4): a disc for online, a hollow
 * sun ring for away, a dusk disc with a bar for focus, a moss disc for a call,
 * a hollow ring in ink-4 for offline. Each state has its own shape, so colour
 * never says it alone, and the words go beside it where there is room.
 */
import { cn } from "@/lib/utils/helpers/cn"

export type Presence = "online" | "away" | "focus" | "call" | "offline"

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  away: "Away",
  focus: "In focus",
  call: "In a call",
  offline: "Offline",
}

/**
 * What the dot says, from what the app knows: a call or focus first, then
 * online with a device connected, then away (online, nothing connected),
 * else offline. Pure.
 */
export function presenceOf({ status, devices, inCall, inFocus }: { status?: string; devices?: number; inCall?: boolean; inFocus?: boolean }): Presence {
  if (inCall) return "call"
  if (inFocus) return "focus"
  if (status === "online") return (devices ?? 1) > 0 ? "online" : "away"
  if (status === "away" || status === "idle") return "away"
  return "offline"
}

export function PresenceDot({ presence, className, ring }: { presence: Presence; className?: string; ring?: string }) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[presence]}
      data-presence={presence}
      className={cn("presence-dot", className)}
      style={ring ? ({ ["--presence-ring" as string]: ring } as React.CSSProperties) : undefined}
    />
  )
}
