import { avatarHueClass } from "@/components/ui/graphics/hues"
import { hueFor, type CampHue } from "@/lib/campHue"
import { displayNameOf, type PersonNameFields } from "@/lib/personName"

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
    return avatarHueClass(hueFor(seed, chosen))
}

/**
 * A person, as the colour functions take them: a name a screen already has
 * (a server resolved it, a call carries it), or their fields, which may carry
 * their id for someone who has no name yet.
 */
export type PersonSeed = string | (PersonNameFields & { user_uuid?: string | null; user_id?: string | null }) | null | undefined

/**
 * What a person's avatar hue is hashed from: their display name, the seed
 * every avatar above keys by, and their id only when there is no name. Give
 * it to IdentityMark as `id` wherever it draws a person. The work area's
 * avatars were keyed by uuid instead, so one person was two colours on one
 * screen (11 Oct: Sam Rivera lake in the task panel and the sidebar, sun in
 * the list beside it and the header's stack); the hub's marks were too (Maya
 * green in her messages, purple in the Inbox beside them).
 */
export function avatarSeed(person?: PersonSeed): string {
    if (typeof person === "string") return person.trim()
    return displayNameOf(person) || (person?.user_uuid ?? person?.user_id ?? "").trim()
}

/**
 * A person's hue: the one way any screen colours a person, for anything that
 * isn't an IdentityMark avatar (a call tile, a speaking ring, a caption's
 * name, a mention's dot, a cursor, an invite's face, the profile card's
 * banner, Home's orbit). A colour the person picked (chosen) wins. Nothing
 * hashes a person's id to a colour locally; app/personHue.test.ts holds it.
 */
export function personHue(person?: PersonSeed, chosen?: string | null): CampHue {
    return hueFor(avatarSeed(person), chosen)
}
