import type { UserProfileDataInterface } from "@/types/user"

/**
 * Returns true when the given user is an external (read-only) contact
 * surfaced through GitHub or other integrations.
 *
 * We trust the BE flag when present, but fall back to an email pattern
 * check for two cases:
 *   1. Dgraph queries that haven't been updated yet to project
 *      `is_external` will leave the field undefined on the wire (struct
 *      has `omitempty`).
 *   2. Older cached SWR responses from before the BE projection fix
 *      shipped.
 *
 * The pattern `github+<login>@external.onecamp.local` is set in
 * business.CreateExternalGitHubUser when GitHub users without a
 * mapped account are provisioned. Future external user sources should
 * keep the `@external.onecamp.` substring so this fallback continues
 * to work.
 */
export function isExternalUser(
    user?: Pick<UserProfileDataInterface, "is_external" | "user_email_id"> | null,
): boolean {
    if (!user) return false
    if (user.is_external === true) return true
    const email = (user.user_email_id || "").toLowerCase()
    return email.includes("@external.onecamp.")
}
