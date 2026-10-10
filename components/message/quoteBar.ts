import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { displayNameOf } from "@/lib/personName"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * The bar beside a quoted message (a reply's parent, the message a reply is
 * being written to): in the quoted person's hue, the colour of their avatar
 * (seeded by the name, as avatars are). It was the brand orange, which spent
 * the accent on decoration (the accent is for the one action on a view).
 */
export function quoteBarClass(by?: Pick<UserProfileDataInterface, "user_name" | "user_full_name"> | string | null): string {
    const name = typeof by === "string" ? by : displayNameOf(by as UserProfileDataInterface | undefined) || ""
    return `${HUE_CLASS[hueFor(name)]} border-l-2 border-hue/70`
}
