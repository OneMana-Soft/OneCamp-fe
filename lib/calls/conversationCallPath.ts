import type { CallRef } from "@/lib/calls/callRef"

/** A conversation's own call page, for someone in it; "" for a meeting. A DM's is the other person's. Pure. */
export function conversationCallPath(ref: CallRef, selfUUID?: string): string {
  if (ref.kind === "channel") return `/app/meet/ch/${ref.id}`
  if (ref.kind === "group") return `/app/meet/grp/${ref.id}`
  if (ref.kind === "dm") {
    const other = ref.id.split(" ").find((id) => id && id !== selfUUID)
    return other ? `/app/meet/chat/${other}` : ""
  }
  return ""
}
