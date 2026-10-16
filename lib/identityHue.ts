import type { CampHue } from "@/lib/campHue"
import { personHue, type PersonSeed } from "@/lib/utils/getAvatarColor"

/**
 * A person's identity hue in a doc: their face in the presence stack, their
 * caret, name flag and selection. One colour per person across the app,
 * keyed on the display name as every avatar is (messages, the sidebar,
 * @mentions); the id only when there's no name; a colour the person picked
 * wins. The doc keyed carets and faces on the user id, so Sam was gold in a
 * doc and teal everywhere else.
 *
 * It is the app-wide personHue(person, chosen) (lib/utils/getAvatarColor),
 * the one implementation since the critics' integration (12 Oct), taking a
 * doc's name-and-id shape.
 */
export function identityHue(person: { name?: string | null; id?: string | null; chosen?: string | null }): CampHue {
    return personHue(identityPerson(person), person.chosen)
}

/**
 * A doc's person (a name and an id) as the colour functions take a person:
 * their name, without the @ a mention's label carries, and their id for when
 * they have none (avatarSeed's rule, not a key of this file's own). A face
 * drawn as an IdentityMark avatar is keyed by avatarSeed(identityPerson(...)).
 */
export function identityPerson(person: { name?: string | null; id?: string | null }): PersonSeed {
    return { user_name: (person.name || "").replace(/^@/, "").trim(), user_uuid: person.id }
}

/**
 * A collaborator's hue, from their awareness state. Each tab sends its own
 * person's hue (`hue`, worked out from their own profile, so a colour they
 * picked travels with it); a state without one (an older tab) is keyed on
 * the name it sends, which is the same display name.
 */
export function collaboratorHue(user: { name?: unknown; id?: unknown; hue?: unknown }): CampHue {
    const str = (v: unknown) => (typeof v === "string" ? v : null)
    return identityHue({ name: str(user.name), id: str(user.id), chosen: str(user.hue) })
}
