import { SCOPE_KINDS } from "@/lib/search/queryApi"
import { SCOPES, scopeOf, type SearchScope } from "@/lib/search/scopes"
import type { SearchResult } from "@/services/searchService"

/**
 * The palette's scopes (linear-28), as Linear's: a letter and a space typed
 * into the empty field narrow the search to one kind, shown as a chip until
 * Backspace on the empty field clears it. Each is one of the search page's
 * scopes (lib/search/scopes), so the kinds the server is asked for, the rows
 * kept and the full search's chip all come from its tables. Not "i": a
 * question typed to search or ask starts "I …".
 */
export type PaletteScope = Extract<SearchScope, "tasks" | "projects" | "people" | "docs" | "channels">

export const PALETTE_SCOPES: readonly { prefix: string; scope: PaletteScope }[] = [
  { prefix: "t", scope: "tasks" },
  { prefix: "p", scope: "projects" },
  { prefix: "u", scope: "people" },
  { prefix: "d", scope: "docs" },
  { prefix: "c", scope: "channels" },
]

/** The scope a field's whole text names, a letter then a space ("t ", or "T " as a phone writes it); else null. */
export function typedScope(text: string): PaletteScope | null {
  if (text.length !== 2 || text[1] !== " ") return null
  const letter = text[0].toLowerCase()
  return PALETTE_SCOPES.find((s) => s.prefix === letter)?.scope ?? null
}

/** A scope as its chip says it ("Tasks") and as words say it ("tasks"): the search page's names. */
export function scopeWords(scope: SearchScope): { label: string; plural: string } {
  const s = SCOPES.find((x) => x.id === scope) ?? SCOPES[0]
  return { label: s.label, plural: s.plural }
}

/**
 * The text the server reads for words searched in a scope: a type: for each of
 * the scope's kinds, which the grammar merges into one (business/SearchQuery,
 * a field written twice is an OR), then the words. Kinds are bare words, so
 * they need none of the grammar's quoting.
 */
export function scopedText(words: string, scope: SearchScope | null | undefined): string {
  const w = words.trim()
  if (!scope || scope === "all") return w
  return [...SCOPE_KINDS[scope].map((kind) => `type:${kind}`), w].filter(Boolean).join(" ")
}

/** The search page for words, on the scope's chip (its ?in=). */
export function searchPageHref(words: string, scope?: SearchScope | null): string {
  const q = `/app/search?query=${encodeURIComponent(words.trim())}`
  return scope && scope !== "all" ? `${q}&in=${scope}` : q
}

/** Whether a scope holds a kind of thing (a hit's, a place's or a recent item's type), by the search page's grouping. */
export function inScope(type: SearchResult["type"], scope: SearchScope | null | undefined): boolean {
  return !scope || scope === "all" || scopeOf({ type }) === scope
}
