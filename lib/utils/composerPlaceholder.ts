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
  // A phone's composer has room for about 26 characters beside its +, emoji
  // and microphone: "Message or ask @Release Captain" was cut at "@Release",
  // a name broken in half. There it is the plain prompt; the phone's bar says
  // "1 agent" and "+" offers "Ask Release Captain…".
  { compact = false }: { compact?: boolean } = {},
): string {
  const base = `Message #${channelName}`
  const agent = agentNames.find((n) => n.trim() !== "")?.trim()
  if (!agent || compact) return base
  return `${base}, or ask @${agent}`
}

// The other composers' placeholders, which every edition has, are in
// composerPlaceholders.ts.
