/**
 * A task's tags live in its label, comma-separated ("frontend, needs review"),
 * as the server keeps them (helpers/tags.go). Pure helpers, for their test.
 */
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

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

/**
 * A tag's colour: its camp hue's tint, with the name in the hue's ink (5.9:1
 * or more on the tint, in both themes). The same name is the same colour
 * wherever it shows, whatever its case. It was eight raw Tailwind hues of its
 * own; now a tag's colours are the six every person and project draws from.
 */
export function tagTone(tag: string): string {
  return `${HUE_CLASS[hueFor(tag)]} bg-hue-tint text-hue-ink`
}
