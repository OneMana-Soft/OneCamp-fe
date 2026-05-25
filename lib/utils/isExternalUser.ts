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
 *
 * Slack import provisions external users with synth emails of the
 * shape `slack-import-<workspace>-<u_id>@no-reply.local` (when the
 * Slack user had no real email) or `<real>+slack-<u_id>@<real-domain>`
 * (when the real email collides with an existing OneCamp account).
 * The first shape is recognised by the `@no-reply.local` suffix; the
 * second always carries `is_external=true` from the BE so the legacy
 * fallback isn't needed.
 */
export function isExternalUser(
    user?: Pick<UserProfileDataInterface, "is_external" | "user_email_id"> | null,
): boolean {
    if (!user) return false
    if (user.is_external === true) return true
    const email = (user.user_email_id || "").toLowerCase()
    if (email.includes("@external.onecamp.")) return true
    if (email.endsWith("@no-reply.local")) return true
    return false
}
