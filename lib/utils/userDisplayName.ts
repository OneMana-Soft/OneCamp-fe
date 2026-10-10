/**
 * The name a person or bot is shown by in a conversation list or header.
 *
 * A bot's user_name is its login handle ("onecamp-ai"); the name it goes by
 * ("OneCamp AI") is its user_full_name. People are shown by user_name, as
 * they always have been here: for some accounts the two fields differ, and
 * switching every DM to the other field would rename people unasked.
 */
export function userDisplayName(
  user?: { user_name?: string | null; user_full_name?: string | null; is_bot?: boolean | null } | null,
): string {
  if (!user) return ""
  if (user.is_bot && user.user_full_name) return user.user_full_name
  return user.user_name || user.user_full_name || ""
}
