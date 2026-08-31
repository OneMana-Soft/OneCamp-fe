/**
 * What each kind of bot says about itself on its profile.
 *
 * WHY THIS IS KEYED. is_bot is one boolean covering principals that do
 * completely different jobs, and every one of them was being shown the
 * workspace assistant's identity: an agent someone configured was titled
 * "Assistant", offered a "Chat with AI" button and described as recapping calls
 * and running agents, none of which it does. On the AI-free edition the same
 * copy appeared on a build containing no AI at all.
 *
 * The backend now says which kind it is (`user_bot_kind`, classified from the
 * principal's email in domain/User/botKind.go). This maps that to words.
 *
 * The assistant's bio said "recaps recorded calls", which was true and is not
 * any more: transcripts no longer require a recording, so it recaps calls. The
 * wording is deliberately about what it produces rather than what it needs,
 * because the thing it needs has changed once already.
 */

export type BotKind = "assistant" | "agent" | "automation" | "bot"

export interface BotProfileCopy {
    /** Dialog title and mobile sheet heading. */
    title: string
    /** The short badge beside the name. Kept to one word so it does not wrap. */
    badge: string
    /** Shown where a member's email address would be. */
    subtitle: string
    /** The About paragraph. The caller prefixes the bot's display name. */
    bio: string
    /** Extra sentence the desktop dialog has room for; the mobile sheet omits it. */
    invite?: string
    /** The button that opens a conversation with it. */
    action: string
    /** Used when the server sends no display name; it normally sends one. */
    defaultName: string
}

/** The kind assumed when the server sends nothing, or a kind this build predates. */
const FALLBACK_KIND: BotKind = "bot"

export const BOT_PROFILE_COPY: Record<BotKind, BotProfileCopy> = {
    assistant: {
        title: "Assistant",
        badge: "AI",
        subtitle: "Automated assistant",
        bio: "is your workspace assistant. It recaps calls, answers questions in a DM or when you @mention it in a channel, and runs your agents and automations.",
        invite: "Message it anytime to ask about your workspace.",
        action: "Chat with AI",
        defaultName: "OneCamp AI",
    },
    agent: {
        title: "Agent",
        badge: "Agent",
        subtitle: "Automated agent",
        // Deliberately does not describe what it does. Only the person who set
        // the agent up knows that, and guessing produces the exact overclaim
        // this module exists to remove.
        bio: "is an agent configured in your workspace. It posts only what that agent was set up to do.",
        action: "Message",
        defaultName: "Agent",
    },
    automation: {
        title: "Automation",
        badge: "Bot",
        subtitle: "Automated account",
        bio: "posts messages sent by your workspace's workflows and integrations.",
        action: "Message",
        defaultName: "OneCamp Automations",
    },
    bot: {
        title: "Bot",
        badge: "Bot",
        subtitle: "Automated account",
        bio: "is an automated account rather than a person.",
        action: "Message",
        defaultName: "Bot",
    },
}

function isBotKind(kind: string): kind is BotKind {
    return Object.prototype.hasOwnProperty.call(BOT_PROFILE_COPY, kind)
}

/**
 * Copy for a bot of this kind, falling back to neutral wording.
 *
 * The fallback is the point: an unrecognised kind must read as a plain
 * automated account, never as the assistant, or a server that learns a new kind
 * before the client does reintroduces the overclaim.
 */
export function botProfileCopy(kind: string | null | undefined): BotProfileCopy {
    return kind && isBotKind(kind) ? BOT_PROFILE_COPY[kind] : BOT_PROFILE_COPY[FALLBACK_KIND]
}
