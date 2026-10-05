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

/** Whether a name follows its rule; the value is trimmed first. */
export function isValidName(kind: NameKind, value: string): boolean {
  const r = NAME_RULES[kind]
  const v = value.trim()
  const n = [...v].length
  return n >= r.min && n <= r.max && r.pattern.test(v)
}

/** A zod schema for a name; `what` starts the error, e.g. "Channel name". */
export function nameSchema(kind: NameKind, what: string) {
  const r = NAME_RULES[kind]
  return z
    .string()
    .trim()
    .refine((v) => [...v].length >= r.min, r.min === 1 ? `${what} can't be empty` : `${what} needs at least ${r.min} characters`)
    .refine((v) => [...v].length <= r.max, `${what} can be at most ${r.max} characters`)
    .refine((v) => v === "" || r.pattern.test(v), r.allows ? `${what} can use ${r.allows}` : `${what} can't contain control characters`)
}

/** An optional field: empty, or a valid name. */
export function optionalNameSchema(kind: NameKind, what: string) {
  return z.union([z.string().trim().length(0), nameSchema(kind, what)]).optional()
}
