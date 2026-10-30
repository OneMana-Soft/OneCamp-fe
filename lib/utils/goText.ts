// Text as the Go server reads it, for the browser's code that must mean what
// the server means: a table's filters and sorts on either side of the rows
// the browser sorts itself (lib/tables/viewRules, business/RowQuery), and the
// search grammar's words (lib/search/query). JavaScript's own trim and
// toLowerCase differ from Go's: trim takes U+FEFF and leaves U+0085 (NEL),
// and toLowerCase writes a capital sigma that ends a word as a final sigma
// (Go writes σ) and İ (U+0130) as "i" with a combining dot (Go writes "i").
// Pure.

/** Whether a code point is a space to Go (unicode.IsSpace), exactly. */
export function isGoSpace(cp: number): boolean {
  if (cp <= 0xff) return cp === 9 || cp === 10 || cp === 11 || cp === 12 || cp === 13 || cp === 32 || cp === 0x85 || cp === 0xa0
  return cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x2029 || cp === 0x202f || cp === 0x205f || cp === 0x3000
}

/** s without Go's spaces at either end, as strings.TrimSpace leaves it. */
export function goTrim(s: string): string {
  let a = 0
  let b = s.length
  // Every space Go knows is one UTF-16 unit.
  while (a < b && isGoSpace(s.charCodeAt(a))) a++
  while (b > a && isGoSpace(s.charCodeAt(b - 1))) b--
  return a === 0 && b === s.length ? s : s.slice(a, b)
}

// The two capitals toLowerCase writes otherwise than Go: Σ, and İ.
const NOT_AS_GO = /[\u03a3\u0130]/

/** s in lower case as Go writes it (strings.ToLower): each code point by its own mapping. */
export function goLower(s: string): string {
  if (!NOT_AS_GO.test(s)) return s.toLowerCase()
  let out = ""
  for (const ch of s) out += ch === "\u0130" ? "i" : ch.toLowerCase()
  return out
}
