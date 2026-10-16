import { NotificationType, type ChannelInfoInterface } from "@/types/channel"

/**
 * Whether a channel row is muted: its reader's level is "block" ("Nothing").
 * The sidebar compared with "none", which no level is, so a muted channel
 * never looked muted. Pure.
 */
export function isMutedChannel(c: Pick<ChannelInfoInterface, "notification_type"> | null | undefined): boolean {
  return c?.notification_type === NotificationType.NotificationBlock
}

/**
 * The starred channels as their Channels rows, in starred order: the row has
 * the unread count, the name after a rename and the level, and a channel that
 * isn't in Channels (archived, or left) isn't shown. Starred kept copies of
 * its own that none of those reached, so starring a channel hid its unreads.
 * Pure.
 */
export function starredChannelRows<T extends { ch_uuid: string }>(channels: readonly (T | null | undefined)[], starred: readonly ({ ch_uuid: string } | null | undefined)[]): T[] {
  const byId = new Map<string, T>()
  for (const c of channels) if (c) byId.set(c.ch_uuid, c)
  const out: T[] = []
  for (const s of starred) {
    const row = s ? byId.get(s.ch_uuid) : undefined
    if (row) out.push(row)
  }
  return out
}
