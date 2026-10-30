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

/**
 * What a chip field holds: how typing splits into entries, what's wrong with
 * one (null when nothing), which glyph it carries, and the field's words.
 */
export interface ChipRules {
  split: (text: string) => string[]
  problem: (entry: string) => string | null
  glyph: (entry: string) => EntryKind
  /** The field's name, its placeholder, and the list's accessible name. */
  name: string
  placeholder: string
  listLabel: string
}

/** The sign-up allow-list: domains and addresses. */
export const SIGN_UP_RULES: ChipRules = {
  split: splitEntries,
  problem: entryProblem,
  glyph: entryKind,
  name: "allowed-users",
  placeholder: "alice@example.com, @example.com",
  listLabel: "On the allow-list",
}

// A host as the server's list of sites keeps it (business/Policy hostPattern):
// "youtube.com", or "*.figma.com" for its subdomains.
const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** One typed site as the list keeps it: its host alone, lower case. "www." stays: the editor matches a link's whole host. Pure. */
export function normalizeHost(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (!v) return ""
  return v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "")
}

/** Why a site can't be on the list of sites docs embed, or null. Pure. */
export function hostProblem(entry: string): string | null {
  if (!HOST.test(entry)) return "Not a site. Write one like embed.example.com, or *.example.com for all of its subdomains."
  return null
}

/** The sites docs can embed, beyond the built-in ones: hosts, with a wildcard for subdomains. */
export const EMBED_HOST_RULES: ChipRules = {
  split: (text) => text.split(/[\s,;]+/).map(normalizeHost).filter(Boolean),
  problem: hostProblem,
  glyph: () => "domain",
  name: "embed-sites",
  placeholder: "embed.example.com, *.example.org",
  listLabel: "Sites docs can embed",
}
