// Where the unread messages start, as a conversation is opened: the "New"
// line (MessageListVirtua's unread item). The unread count is what the sidebar
// said on opening, which counts other people's messages since the reader last
// looked; the line goes above the oldest of them.

/**
 * The key of the first unread message: counting back `count` messages not the
 * reader's own. Null when there is none, or when it would be the first message
 * loaded (with nothing above it, a line would separate nothing).
 */
export function firstUnreadKey<T>(
  messages: readonly T[],
  count: number,
  isMine: (m: T) => boolean,
  keyOf: (m: T) => string,
): string | null {
  if (count <= 0 || messages.length === 0) return null
  let left = count
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isMine(messages[i])) continue
    left--
    if (left === 0) return i === 0 ? null : keyOf(messages[i])
  }
  return null
}
