import { displayNameOf, type PersonNameFields } from "@/lib/personName"

/**
 * The name a person or bot is shown by in a conversation list or header.
 *
 * A bot made before bots took their name as user_name has its login handle
 * there ("onecamp-ai"); the name it goes by ("OneCamp AI") is its
 * user_full_name. People are shown by the one name rule (lib/personName).
 */
export function userDisplayName(user?: PersonNameFields | null): string {
  if (!user) return ""
  if (user.is_bot && user.user_full_name) return user.user_full_name
  return displayNameOf(user)
}

/**
 * The name above a message. A bot is named by its display name; a person by
 * the live name the store holds for them (it follows renames), else the name
 * the message carries.
 */
export function messageAuthorName(from?: PersonNameFields | null, liveName?: string | null): string {
  if (from?.is_bot && from.user_full_name) return from.user_full_name
  return liveName || displayNameOf(from)
}
