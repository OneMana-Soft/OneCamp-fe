import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor, type CampHue } from "@/lib/campHue"

/**
 * The hue a mentioned person is drawn in: the same as their avatar. Avatars
 * are seeded by the display name today (lib/utils/getAvatarColor), so a
 * mention is too, by the name it carries; were avatars to move to the uuid,
 * this moves with them.
 */
export function mentionHue(label: string | null | undefined): CampHue {
    return hueFor((label || "").replace(/^@/, ""))
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" }
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e])

// The opening tag of a person mention, as the sanitiser writes it (attributes
// double-quoted). Channel and work-item references are data-type
// "channelMention" and "entityMention", which this leaves alone.
const MENTION_TAG = /<span\b([^>]*\bdata-type="mention"[^>]*)>/g

/**
 * A stored message body with each person mention in that person's hue: their
 * tint behind, their ink on it (the playful layer, "mention chips in the
 * mentioned person's tint"). Pure, and a no-op for a body with no mention.
 */
export function tintMentions(html: string): string {
    if (!html.includes('data-type="mention"')) return html
    return html.replace(MENTION_TAG, (_tag, attrs: string) => {
        const label = /\bdata-label="([^"]*)"/.exec(attrs)?.[1]
        const hue = HUE_CLASS[mentionHue(label ? decode(label) : "")]
        const withHue = /\bclass="/.test(attrs)
            ? attrs.replace(/\bclass="([^"]*)"/, (_m, c: string) => `class="${c ? `${c} ` : ""}${hue}"`)
            : `${attrs} class="${hue}"`
        return `<span${withHue}>`
    })
}
