/**
 * The one name rule: the name people see for a member.
 *
 * It is their display name (user_name) when they have one, else their full
 * name (user_full_name), else their address's part before the first @, else
 * "". Each is trimmed. The backend applies the same rule
 * (helpers.PersonDisplayName, DgraphUser.DisplayName), so a name in a
 * notification, an email or a search result matches the one on screen.
 *
 * Guests and relayed authors are named elsewhere (lib/relayedAuthor).
 */

export interface PersonNameFields {
  user_name?: string | null
  user_full_name?: string | null
  user_email_id?: string | null
  user_handle?: string | null
  is_bot?: boolean | null
}

const trimmed = (s?: string | null) => (s ?? "").trim()

/** The name to show for a member, by the one rule. "" when there is nothing to go on. */
export function displayNameOf(user?: PersonNameFields | null): string {
  if (!user) return ""
  const display = trimmed(user.user_name)
  if (display) return display
  const full = trimmed(user.user_full_name)
  if (full) return full
  const email = trimmed(user.user_email_id)
  if (!email) return ""
  const at = email.indexOf("@")
  return at < 0 ? email : email.slice(0, at)
}

/**
 * The full name, for a second line under the shown name, when it says
 * something the shown name does not. "" otherwise.
 */
export function secondaryNameOf(user?: PersonNameFields | null): string {
  const full = trimmed(user?.user_full_name)
  if (!full) return ""
  return full.toLowerCase() === displayNameOf(user).toLowerCase() ? "" : full
}

/** The member's @handle without the @, or "". */
export function handleOf(user?: PersonNameFields | null): string {
  return trimmed(user?.user_handle).replace(/^@+/, "")
}

/** A search box's text, ready to compare: trimmed, lower case, one leading "@" dropped. */
export function normalizePersonQuery(query?: string | null): string {
  return trimmed(query).replace(/^@/, "").trim().toLowerCase()
}

/**
 * Whether a member matches what someone typed into a people picker: their
 * shown name, full name or handle contains it, ignoring case, and a leading
 * "@" is allowed. Extra fields (an address, say) can be passed to match too.
 * An empty query matches everyone.
 */
export function matchesPerson(
  user: PersonNameFields | null | undefined,
  query?: string | null,
  extra: Array<string | null | undefined> = [],
): boolean {
  const q = normalizePersonQuery(query)
  if (!q) return true
  if (!user) return false
  const fields = [displayNameOf(user), user.user_name, user.user_full_name, handleOf(user), ...extra]
  return fields.some((f) => trimmed(f).toLowerCase().includes(q))
}

/**
 * How well a member matches, for ordering a picker: 0 when a name or the
 * handle starts with the query, 1 when a word in a name does, 2 for any other
 * match. Assumes matchesPerson is true.
 */
export function personMatchRank(user: PersonNameFields, query?: string | null): number {
  const q = normalizePersonQuery(query)
  if (!q) return 0
  const fields = [displayNameOf(user), trimmed(user.user_full_name), handleOf(user)].map((f) => f.toLowerCase())
  if (fields.some((f) => f.startsWith(q))) return 0
  if (fields.some((f) => f.split(/[\s._-]+/).some((w) => w.startsWith(q)))) return 1
  return 2
}

/**
 * The text a cmdk people list filters an item by: the shown name, the full
 * name, "@handle" (so a query typed with its @ still matches), the address
 * and the id.
 */
export function personSearchValue(
  shownName: string,
  opts: { fullName?: string | null; handle?: string | null; email?: string | null; id?: string | null } = {},
): string {
  const handle = trimmed(opts.handle).replace(/^@+/, "")
  return [shownName, opts.fullName, handle ? `@${handle}` : "", opts.email, opts.id]
    .map((s) => trimmed(s))
    .filter(Boolean)
    .join(" ")
}

/**
 * The members a picker offers for what was typed, best first: those whose
 * name or handle starts with it, then those with a word that does, then the
 * rest that match. Ties keep their order. At most `limit` when given.
 */
export function pickPeople<T extends PersonNameFields>(people: T[], query?: string | null, limit?: number): T[] {
  const picked = people
    .filter((p) => matchesPerson(p, query))
    .map((p, i) => ({ p, i, r: personMatchRank(p, query) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p)
  return limit === undefined ? picked : picked.slice(0, limit)
}

/** A cmdk item's keywords for a member: their names and "@handle". Undefined when there are none. */
export function personKeywords(user?: PersonNameFields | null, extra: string[] = []): string[] | undefined {
  const handle = handleOf(user)
  const words = [displayNameOf(user), trimmed(user?.user_full_name), handle ? `@${handle}` : "", ...extra].filter(Boolean)
  return words.length ? Array.from(new Set(words)) : undefined
}
