/**
 * A task's tags live in its label, comma-separated ("frontend, needs review"),
 * as the server keeps them (helpers/tags.go). Pure helpers, for their test.
 */
export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 32

const clean = (t: string) => t.split(/\s+/).filter(Boolean).join(" ")

/** The tags in a label. */
export function splitTags(label: string | null | undefined): string[] {
  if (!label) return []
  return label.split(",").map(clean).filter(Boolean)
}

/** A label from tags: trimmed, cut to length, duplicates (ignoring case) dropped, at most MAX_TAGS. */
export function joinTags(tags: string[]): string {
  const seen = new Set<string>()
  const keep: string[] = []
  for (const raw of tags) {
    const t = clean(raw.replace(/,/g, " ")).slice(0, MAX_TAG_LENGTH).trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    keep.push(t)
    if (keep.length === MAX_TAGS) break
  }
  return keep.join(", ")
}

/** Whether a label carries a tag, ignoring case. */
export function hasTag(label: string | null | undefined, tag: string): boolean {
  const k = tag.toLowerCase()
  return splitTags(label).some((t) => t.toLowerCase() === k)
}

// Soft tints that read on both themes; a tag keeps its colour everywhere.
const TONES = [
  "bg-sky-500/12 text-sky-800 dark:text-sky-300",
  "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "bg-rose-500/12 text-rose-800 dark:text-rose-300",
  "bg-teal-500/12 text-teal-800 dark:text-teal-300",
  "bg-fuchsia-500/12 text-fuchsia-800 dark:text-fuchsia-300",
  "bg-lime-500/15 text-lime-800 dark:text-lime-300",
] as const

/** The tint for a tag: the same name, the same colour, whatever its case. */
export function tagTone(tag: string): string {
  let h = 0
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return TONES[h % TONES.length]
}
