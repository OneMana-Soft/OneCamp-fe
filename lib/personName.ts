/**
 * The one name rule, the name people see for a member: the display name
 * (user_name), else the full name, else the address before its @, else "",
 * each trimmed. The backend's is the same (helpers.PersonDisplayName), so a
 * notification or a search result names them as the screen does. Guests and
 * relayed authors: lib/relayedAuthor.
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

/** A name's first word ("Sam" of "Sam Rivera"), for a line that names someone again; "" for none. */
export function firstNameOf(name?: string | null): string {
  return trimmed(name).split(/\s+/)[0]
}

/**
 * The full name, for a line under the shown name, when it says something
 * that name doesn't; else "".
 */
export function secondaryNameOf(user?: PersonNameFields | null): string {
  const full = trimmed(user?.user_full_name)
  if (!full) return ""
  return full.toLowerCase() === displayNameOf(user).toLowerCase() ? "" : full
}

/**
 * A salutation's given name ("Good morning, Sam"): the full name's first
 * word, else the display name's; never the address.
 */
export function greetingNameOf(user?: PersonNameFields | null): string {
  return firstNameOf(user?.user_full_name) || firstNameOf(user?.user_name)
}

/** The member's @handle without the @, or "". */
export function handleOf(user?: PersonNameFields | null): string {
  return trimmed(user?.user_handle).replace(/^@+/, "")
}

/**
 * The line under a name in a people list: the address, else "@handle", else
 * "" (the demo's visitor sees no addresses).
 */
export function addressOrHandleOf(user?: PersonNameFields | null): string {
  const address = trimmed(user?.user_email_id)
  if (address) return address
  const handle = handleOf(user)
  return handle ? `@${handle}` : ""
}

/** A search box's text, ready to compare: trimmed, lower case, one leading "@" dropped. */
export function normalizePersonQuery(query?: string | null): string {
  return trimmed(query).replace(/^@/, "").trim().toLowerCase()
}

/**
 * Whether a member matches a people picker's query: the shown name, full name
 * or handle contains it, in any case, a leading "@" allowed; extra fields (an
 * address) match too, and "" matches everyone.
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
 * A match's rank, to order a picker: 0 a name or the handle starts with the
 * query, 1 a word in a name does, else 2. Assumes matchesPerson is true.
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
 * The text a cmdk people list filters by: shown name, full name, "@handle"
 * (a query's @ still matches), address and id.
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
 * A picker's members for a query, best first (personMatchRank), ties in
 * their order; at most `limit` when given.
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
