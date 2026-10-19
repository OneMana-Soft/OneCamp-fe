import type { FlatItem } from "@/types/virtual"

/**
 * A shared history's heading: when people are added to a conversation and the
 * person adding them shares earlier messages, the new conversation holds
 * copies of them at their own times, before its first line
 * (business/Conversation share.go). The heading sits once above the first
 * copy loaded, so the copies read as what they are, whichever page holds
 * them. Pure.
 */
export function withSharedHistory<T>(items: FlatItem<T>[], isCopy: (t: T) => boolean): FlatItem<T>[] {
  const at = items.findIndex((i) => i.type === "item" && i.data !== undefined && isCopy(i.data))
  if (at < 0) return items
  return [...items.slice(0, at), { type: "shared", key: "shared-history" }, ...items.slice(at)]
}
