import { personHue } from "@/lib/utils/getAvatarColor"
import { type CampHue } from "@/lib/campHue"
import { isAIBot } from "@/lib/botCopy"
import { SPARK_PATH } from "@/components/ui/graphics/motifs"

/**
 * The hue of a mentioned person's dot: the same as their avatar. Avatars
 * are seeded by the display name today (lib/utils/getAvatarColor), so a
 * mention is too, by the name it carries; were avatars to move to the uuid,
 * this moves with them.
 */
export function mentionHue(label: string | null | undefined): CampHue {
    return personHue((label || "").replace(/^@/, ""))
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" }
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e])

// A person mention, as the sanitiser writes it (attributes double-quoted),
// with its text's leading "@". Channel and work-item references are data-type
// "channelMention" and "entityMention", which this leaves alone.
const MENTION = /<span\b([^>]*\bdata-type="mention"[^>]*)>(@?)/g

const SPARK_SVG = `<svg class="mention-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`

export interface MentionContext {
    /** The reader's user uuid: a mention of them is the one coloured chip. */
    me?: string | null
    /** Agents' user uuids: their chips are on the agent tint, with a spark. */
    agentIds?: ReadonlySet<string> | readonly string[]
}

/** A mention's user uuid: data-id is "uuid@uid" or just "uuid". */
export const mentionUserId = (id: string | null | undefined) => (id || "").split("@")[0]

/**
 * The agents in a bot-kind map (GET /user/botKinds, useBotKindMap): only AI
 * bots draw as agents, so an integration bot's mention stays a person's chip.
 */
export function agentIdsOf(botKinds: Record<string, string> | null | undefined): string[] {
    if (!botKinds) return []
    return Object.keys(botKinds).filter((id) => isAIBot(botKinds[id]))
}

/**
 * The kind of chip a mention is (chat.md C14, content.md D24): "me" for a
 * mention of the reader (brand-muted, the only coloured chip), "agent" for an
 * agent (its tint and a spark where the "@" was), otherwise "person": a
 * neutral chip with a 6 px dot in that person's hue before the "@".
 */
export function mentionKind(id: string | null | undefined, ctx: MentionContext = {}): "me" | "agent" | "person" {
    const uid = mentionUserId(id)
    if (uid && ctx.me && uid === ctx.me) return "me"
    const agents = ctx.agentIds
    if (uid && agents && (Array.isArray(agents) ? agents.includes(uid) : (agents as ReadonlySet<string>).has(uid))) return "agent"
    return "person"
}

/**
 * A stored message body with each person mention marked for its chip:
 * class mention-me, mention-agent (its "@" drawn as the spark), or
 * mention-person with data-hue (the dot's colour, the person's avatar hue).
 * Pure, and a no-op for a body with no mention.
 */
export function tintMentions(html: string, ctx: MentionContext = {}): string {
    if (!html.includes('data-type="mention"')) return html
    return html.replace(MENTION, (_tag, attrs: string, at: string) => {
        const id = /\bdata-id="([^"]*)"/.exec(attrs)?.[1]
        const label = /\bdata-label="([^"]*)"/.exec(attrs)?.[1]
        const kind = mentionKind(id, ctx)
        const cls = `mention-${kind}`
        let out = /\bclass="/.test(attrs)
            ? attrs.replace(/\bclass="([^"]*)"/, (_m, c: string) => `class="${c ? `${c} ` : ""}${cls}"`)
            : `${attrs} class="${cls}"`
        if (kind === "person") out += ` data-hue="${mentionHue(label ? decode(label) : "")}"`
        return `<span${out}>${kind === "agent" ? SPARK_SVG : at}`
    })
}

/** Whether a stored body mentions this reader (the row then reads "for you"). */
export function mentionsUser(html: string | null | undefined, selfId: string | undefined): boolean {
    if (!html || !selfId) return false
    return html.includes(`data-id="${selfId}"`) || html.includes(`data-id="${selfId}@`)
}
