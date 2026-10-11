/**
 * Addresses typed or pasted into an invitation field, as chips.
 *
 * The first run's "Who's coming?" (design v3, admin.md E3) takes a whole list
 * at once: a paste splits on commas, semicolons, spaces and new lines, and a
 * "Name <address>" entry from a mail client keeps only the address. Each
 * piece becomes a chip that says whether it is an address at all, and
 * repeats collapse into the first.
 *
 * LOCAL TO THE AUTH SLICE (11 Oct 2026): the invite dialog (E6, the people
 * slice) parses the same way; the coordinator may unify the two.
 */

export interface InviteChip {
  /** Lowercased and trimmed: the key and what is sent. */
  email: string
  valid: boolean
}

/** A plain address: something@domain.tld, no spaces. The server checks again. */
const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/

export function isEmailAddress(text: string): boolean {
  return ADDRESS.test(text)
}

/** The pieces of a typed or pasted list, each reduced to its address. */
export function splitAddresses(text: string): string[] {
  return text
    // "Priya R <priya@x.io>": the name goes, the address stays.
    .replace(/[^,;\n<>]*<([^>]+)>/g, " $1 ")
    .split(/[\s,;]+/)
    .map((part) => part.replace(/^mailto:/i, "").trim().toLowerCase())
    .filter(Boolean)
}

/** Adds what was typed or pasted to the chips already there, skipping repeats. */
export function addChips(existing: InviteChip[], text: string): InviteChip[] {
  const seen = new Set(existing.map((c) => c.email))
  const next = [...existing]
  for (const email of splitAddresses(text)) {
    if (seen.has(email)) continue
    seen.add(email)
    next.push({ email, valid: isEmailAddress(email) })
  }
  return next
}
