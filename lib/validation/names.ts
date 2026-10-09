// What people may call things. One set of rules for every dialog that names
// something, so a name accepted in one place isn't refused in another, and the
// server's check for channel and team names (helpers.IsValidName) matches.
//
// WHY THESE RULES. The dialogs each carried their own copy of "four to thirty
// ASCII letters, digits and underscores", which refused a channel called
// #qa, a doc called "What's next?", a person called José or O'Brien, a job
// title of "CEO", and every name in a non-Latin script, and allowed an
// underscore the server then rejected.

import { z } from "zod"

export type NameKind = "workspace" | "person" | "title" | "label"

interface Rule {
  min: number
  max: number
  pattern: RegExp
  /** What the pattern allows, for the error. Empty when anything printable is. */
  allows: string
}

export const NAME_RULES: Record<NameKind, Rule> = {
  // Channels, teams, projects: the server checks channel and team names too.
  workspace: { min: 2, max: 40, pattern: /^[\p{L}\p{M}\p{N} _-]+$/u, allows: "letters, numbers, spaces, hyphens and underscores" },
  // A person's name in any language.
  person: { min: 1, max: 60, pattern: /^[\p{L}\p{M}\p{N} .'’-]+$/u, allows: "letters, spaces, apostrophes, hyphens and full stops" },
  // Doc titles: anything you can type, but not control characters.
  title: { min: 1, max: 120, pattern: /^[^\p{Cc}]+$/u, allows: "" },
  // Short free text such as a job title.
  label: { min: 1, max: 60, pattern: /^[^\p{Cc}]+$/u, allows: "" },
}

// Characters that can't be seen: format characters (a zero-width space or
// joiner) and variation selectors.
const UNSEEN = /[\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/u

/**
 * Whether every character of a person's name can be seen where it is, as the
 * server's helpers.IsValidPersonName asks: no format character or variation
 * selector, every accent on a letter or number, and at least one letter or
 * number. Two names that look the same can't then differ invisibly, and
 * "..." isn't anybody's name. Takes the name in NFC.
 */
export function seenAsTyped(name: string): boolean {
  if (UNSEEN.test(name)) return false
  let hasLetter = false
  let prevBase = false
  for (const ch of name) {
    if (/\p{M}/u.test(ch)) {
      if (!prevBase) return false
      continue
    }
    prevBase = /[\p{L}\p{N}]/u.test(ch)
    hasLetter ||= prevBase
  }
  return hasLetter
}

/** Whether a name follows its rule; the value is trimmed (and, for a person, put in NFC) first. */
export function isValidName(kind: NameKind, value: string): boolean {
  const r = NAME_RULES[kind]
  const v = kind === "person" ? value.trim().normalize("NFC") : value.trim()
  const n = [...v].length
  return n >= r.min && n <= r.max && r.pattern.test(v) && (kind !== "person" || seenAsTyped(v))
}

/** A zod schema for a name; `what` starts the error, e.g. "Channel name". */
export function nameSchema(kind: NameKind, what: string) {
  const r = NAME_RULES[kind]
  const schema = z
    .string()
    .trim()
    .refine((v) => [...v].length >= r.min, r.min === 1 ? `${what} can't be empty` : `${what} needs at least ${r.min} characters`)
    .refine((v) => [...v].length <= r.max, `${what} can be at most ${r.max} characters`)
    .refine((v) => v === "" || r.pattern.test(v), r.allows ? `${what} can use ${r.allows}` : `${what} can't contain control characters`)
  if (kind !== "person") return schema
  return schema
    .refine((v) => v === "" || /[\p{L}\p{N}]/u.test(v), `${what} needs at least one letter or number`)
    .refine((v) => v === "" || seenAsTyped(v.normalize("NFC")), `${what} has a character that can't be seen, or an accent on its own. Type it again without it.`)
}

/** An optional field: empty, or a valid name. */
export function optionalNameSchema(kind: NameKind, what: string) {
  return z.union([z.string().trim().length(0), nameSchema(kind, what)]).optional()
}

/** The rule's words for a name it refuses, or "" for one it accepts; `what` starts them. */
export function nameProblem(kind: NameKind, what: string, value: string): string {
  const checked = nameSchema(kind, what).safeParse(value)
  return checked.success ? "" : checked.error.issues[0]?.message || `${what} can't be used`
}

// A person's @handle: short, unique, lowercase, made from their name when they
// join. Its own rule, the server's (helpers.IsValidHandle), checked only when
// someone changes it.
export const HANDLE_RULE = {
  min: 2,
  max: 30,
  pattern: /^[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]*$/u,
  allows: "lowercase letters, numbers, full stops, hyphens and underscores, starting with a letter or number",
}

/**
 * Words a mention means for a group of people, so nobody's handle may be one
 * (the server's helpers.HandleIsReserved).
 */
export const RESERVED_HANDLES = ["everyone", "here", "channel", "all", "admin"]

/** A handle as typed, in the form it is kept: trimmed, without a leading @, lowercase, in NFC. */
export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase().normalize("NFC")
}

/** Why a (normalized) handle can't be had, or "" when it can. */
export function handleProblem(handle: string): string {
  if (RESERVED_HANDLES.includes(handle)) {
    return `@${handle} means a group of people in a mention, so it can't be anyone's handle. Try another.`
  }
  if (UNSEEN.test(handle)) {
    return `A handle can use ${HANDLE_RULE.min} to ${HANDLE_RULE.max} ${HANDLE_RULE.allows}.`
  }
  const n = [...handle].length
  if (n < HANDLE_RULE.min || n > HANDLE_RULE.max || !HANDLE_RULE.pattern.test(handle)) {
    return `A handle can use ${HANDLE_RULE.min} to ${HANDLE_RULE.max} ${HANDLE_RULE.allows}.`
  }
  return ""
}
