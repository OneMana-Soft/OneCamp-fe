// What the sign-up allow-list may hold, said before Save is pressed (design
// v3, admin A7). The server is the judge (business/Settings/allowList.go);
// this mirrors its refusals so a chip turns red as it is made, not after a
// round trip, and keeps the server's own words for anything it adds later.

/**
 * Domains anyone can have an address at. As an entry ("@outlook.com") one
 * would let everybody in. Mirrors publicMailDomains on the server: keep the
 * two lists the same.
 */
export const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com",
  "icloud.com", "me.com",
  "aol.com",
  "proton.me", "protonmail.com",
  "gmx.com", "gmx.net",
  "mail.com",
  "yandex.com",
  "zoho.com",
])

/** The line under the field while a public domain is in it. */
export const PUBLIC_DOMAIN_LINE = "Public email domains like gmail.com can't be added."

export type EntryKind = "domain" | "address"

const DOMAIN = /^@?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
const ADDRESS = /^[^\s@,]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

/**
 * One typed entry as the list keeps it: trimmed, lowercased, and a bare
 * domain ("kestrel.studio") written as the server reads one ("@kestrel.studio").
 * Pure.
 */
export function normalizeEntry(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (!v) return ""
  if (!v.includes("@") && DOMAIN.test(v)) return `@${v}`
  return v
}

/** A domain entry starts with @; anything else is one person's address. Pure. */
export function entryKind(entry: string): EntryKind {
  return entry.startsWith("@") ? "domain" : "address"
}

/**
 * Why an entry can't be on the list, or null when it can. Pure.
 */
export function entryProblem(entry: string): string | null {
  // Plain ASCII only: no sign-in is matched to anything else
  // (helpers.NormalizeEmail on the server).
  if (/[^\x21-\x7e]/.test(entry)) return "Only plain letters, digits and symbols can be matched to a sign-in."
  if (entry.startsWith("@")) {
    if (!DOMAIN.test(entry)) return "Not a domain. Write one like @example.com."
    if (PUBLIC_MAIL_DOMAINS.has(entry.slice(1))) return `${entry.slice(1)} is a public email domain, so it would let anyone in.`
    return null
  }
  if (!ADDRESS.test(entry)) return "Not an email address or a domain like @example.com."
  return null
}

/** Whether an entry is refused for being a public domain. Pure. */
export function isPublicDomain(entry: string): boolean {
  return entry.startsWith("@") && PUBLIC_MAIL_DOMAINS.has(entry.slice(1))
}

/**
 * Text typed or pasted into the field, split into entries at commas,
 * semicolons, spaces and new lines. Pure.
 */
export function splitEntries(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map(normalizeEntry)
    .filter(Boolean)
}
