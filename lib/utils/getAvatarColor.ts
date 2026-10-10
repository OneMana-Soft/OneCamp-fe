import { avatarHueClass } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"

/**
 * The avatar fallback: a person without a photo, in their camp hue. The hue's
 * tint behind its ink initials, inside a hairline of its strong cut.
 *
 * History, because it has moved twice. It was a name-hashed pastel from ten
 * unrelated hues (a purple SR, a peach MC, a beige JW), which was noise. Wave
 * 1 made it one neutral grey, which was calm and anonymous: an avatar row read
 * as a row of grey coins. The playful layer (10 Oct 2026) brings colour back as
 * a system: six harmonised hues, the same hue for the same person on every
 * screen (lib/campHue), every pair of cuts measured for AA. Photos are
 * untouched; agents keep their own tint, set where an agent's avatar is drawn.
 *
 * The seed is whatever the call site keys the person by. Today every caller
 * passes the display name, so a person is one colour everywhere; a caller that
 * switches to the uuid must switch with all the others, or that person gets
 * two colours. A colour the person picked (chosen) wins.
 */
export function getAvatarFallbackClass(seed?: string | undefined | null, chosen?: string | null): string {
    return `${avatarHueClass(hueFor(seed, chosen))} font-medium`
}
