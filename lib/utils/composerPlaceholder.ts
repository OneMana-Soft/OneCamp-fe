/**
 * The channel composer's placeholder. When the channel has an agent in it, the
 * placeholder offers it: "Message #engineering, or ask @Release Captain". That
 * is the moment somebody is about to write, and on a phone the header has no
 * room to say which agents are there. One agent is named; with more, the one
 * listed first (by name) stands for them, since the header lists the rest.
 */
export function channelComposerPlaceholder(
  channelName: string,
  agentNames: string[] = [],
  // A phone's header already names the channel, and its composer is about 35
  // characters wide: the full form was cut off mid-way through the agent's name.
  { compact = false }: { compact?: boolean } = {},
): string {
  const base = `Message #${channelName}`
  const agent = agentNames.find((n) => n.trim() !== "")?.trim()
  if (!agent) return base
  return compact ? `Message, or ask @${agent}` : `${base}, or ask @${agent}`
}

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
