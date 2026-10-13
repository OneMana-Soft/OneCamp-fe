/**
 * Who a name typed after "with" in quick create means (CAL-BUG-10).
 *
 * Quick create used to invite, on save and without showing who, the first
 * search hit whose name merely started with the word: "Coffee with Sam"
 * invited Samantha when there was no Sam, and "Call with Mum" invited
 * Mumtaz, who then had the event, title and notes, on their calendar. Now a
 * name is looked up while it is typed, the card shows who it found, and only
 * a person shown is invited:
 *   found   one person has the name as a whole word of theirs: "Sam" is Sam Rivera;
 *   choose  two or more have it, or only someone whose name starts with it:
 *           the card asks ("Sam? Samantha Lee · Sam Rivera"), and nobody is
 *           invited for it until one is picked;
 *   none    nobody: the name stays in the title, and nobody is invited.
 * Pure.
 */
export interface GuestCandidate {
  uuid: string
  name: string
  /** Their profile picture's object key, when they have one. */
  avatarKey?: string
}

export type NameMatch =
  | { state: "looking" }
  | { state: "found"; person: GuestCandidate }
  | { state: "choose"; options: GuestCandidate[] }
  | { state: "none" }
  | { state: "failed" }

/** Lower case, without accents: "José" and "jose" are one name. */
export const foldName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

/** Whether a typed name is one of a person's names ("whole"), only the start of one ("start"), or neither. */
export function nameFit(typed: string, personName: string): "whole" | "start" | null {
  const t = foldName(typed)
  if (!t) return null
  const full = foldName(personName)
  const words = full.split(/[\s._]+/).filter(Boolean)
  if (full === t || words.includes(t)) return "whole"
  if (words.some((w) => w.startsWith(t))) return "start"
  return null
}

/** What a typed name comes to among the people a search found; at most `max` to choose from. */
export function matchName(typed: string, hits: readonly GuestCandidate[], max = 3): NameMatch {
  const seen = new Set<string>()
  const people = hits.filter((h) => h.uuid && !seen.has(h.uuid) && !!seen.add(h.uuid))
  const whole = people.filter((h) => nameFit(typed, h.name) === "whole")
  if (whole.length === 1) return { state: "found", person: whole[0] }
  const options = [...whole, ...people.filter((h) => nameFit(typed, h.name) === "start")].slice(0, max)
  return options.length > 0 ? { state: "choose", options } : { state: "none" }
}
