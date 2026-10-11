import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"

// One pictographic emoji, with its skin tone, variation selector and any
// zero-width-joined parts (a family, a flag pair).
const EMOJI = /(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2})/gu

/**
 * Whether a message is one to three emoji and nothing else (design v3 chat,
 * C43): it is drawn at 32px, as Campfire draws them larger. A mention, a
 * link or one word makes it an ordinary message.
 */
export function isEmojiOnly(html: string | null | undefined): boolean {
    if (!html || html.length > 400 || html.includes("data-type=")) return false
    const text = htmlToPreviewText(html).replace(/\s+/g, "")
    if (!text) return false
    const found = text.match(EMOJI)
    if (!found || found.length > 3) return false
    return found.join("") === text
}
