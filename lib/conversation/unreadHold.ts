// Mark unread holds (chat B27): a conversation you marked unread stays unread
// while it's open. Nothing marks it read on its own (a message arriving, the
// window coming back, leaving a channel) until you open it again, which reads
// it, as Slack does. The ids are conversations' (a channel's uuid, a DM's or
// group's grouping id); kept in this tab only.

const held = new Set<string>()

/** Keeps id unread until it is opened again. */
export const holdUnread = (id: string): void => void held.add(id)

/** Whether id is held unread: an automatic mark skips it. */
export const isHeldUnread = (id: string): boolean => held.has(id)

/** Opening id again: it reads as usual from here. */
export const releaseUnread = (id: string): void => void held.delete(id)
