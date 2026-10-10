/**
 * The placeholders of the composers every edition has: a direct message, a
 * group and a thread. The channel's, which can offer the channel's agent, is
 * channelComposerPlaceholder in composerPlaceholder.ts, which only the AI
 * edition carries; nothing here may import it.
 */

/**
 * A direct message's placeholder names who it goes to: "Message Maya Chen".
 * Until the name is known it says "Message…".
 */
export function dmComposerPlaceholder(name: string | null | undefined): string {
  const n = name?.trim()
  return n ? `Message ${n}` : "Message…"
}

/** A group's members are already in its header; the placeholder says where it goes. */
export const GROUP_COMPOSER_PLACEHOLDER = "Message the group"

/** Every thread's reply box, on desktop and the phone. */
export const THREAD_COMPOSER_PLACEHOLDER = "Reply…"
