// The tables' natural sort key (coordinator, 21 Oct 2026): one definition,
// written once here, for the browser's sorts, and once in Go
// (business/RowQuery naturalKey), for the cell index's sort column, each
// held to testdata/sortkey/natural.json. A column never changes its order
// because its table passed the 500 rows the browser sorts itself, and "Row 2"
// comes before "Row 10". It replaces localeCompare, whose order varies by
// browser and locale.
//
// The key: the text in NFKD with its combining marks (Mn) dropped;
// case-folded (lower case, then ß as ss, ς as σ, Cherokee small letters as
// capitals, which is where Unicode folds them); trimmed of whitespace at both
// ends; each run of ASCII digits read as a number, its leading zeros dropped
// and zero-padded to 20 digits (a run longer than 20 digits is written as
// ":", its length in two digits, 99 at most, and the run, so it sorts after
// every padded number, and among such runs by length, then by digits); and
// cut to its first 256 code points, so the server's index entry for it always
// fits (Postgres refuses a btree entry over 2,704 bytes). Keys compare by
// code point (compareKeys), as Postgres's C collation compares UTF-8. Pure.

/** The width every run of digits is padded to. */
export const DIGITS_PAD = 20
/** The most code points a key keeps. */
export const KEY_RUNES = 256

const MARKS = /\p{Mn}/gu
// Whitespace at either end, by one list in both languages: ASCII's, NEL, the
// Ogham space, the line and paragraph separators and the byte-order mark (NFKD
// makes the other spaces a plain one).
const EDGES = /^[\t\n\v\f\r \u0085\u1680\u2028\u2029\ufeff]+|[\t\n\v\f\r \u0085\u1680\u2028\u2029\ufeff]+$/g
const DIGIT_RUN = /[0-9]+/g

/** A character folded as Unicode folds case, past the lower case NFKD and toLowerCase leave. */
function foldOne(ch: string): string {
  if (ch === "\u00df") return "ss"
  if (ch === "\u03c2") return "\u03c3"
  const c = ch.codePointAt(0) ?? 0
  // Cherokee folds to its capitals: U+AB70..U+ABBF to U+13A0..U+13EF, U+13F8..U+13FD to U+13F0..U+13F5.
  if (c >= 0xab70 && c <= 0xabbf) return String.fromCodePoint(c - 0xab70 + 0x13a0)
  if (c >= 0x13f8 && c <= 0x13fd) return String.fromCodePoint(c - 8)
  return ch
}

/** A run of digits as it sorts: by its value, padded to DIGITS_PAD; past it, ":" and its length first. */
function runKey(run: string): string {
  const digits = run.replace(/^0+(?=\d)/, "")
  if (digits.length <= DIGITS_PAD) return digits.padStart(DIGITS_PAD, "0")
  return `:${String(Math.min(digits.length, 99)).padStart(2, "0")}${digits}`
}

/** The first n code points of s (a surrogate pair is one). */
function cutCodePoints(s: string, n: number): string {
  if (s.length <= n) return s // no more UTF-16 units than n: no more code points either
  let i = 0
  for (let k = 0; k < n && i < s.length; k++) {
    const pair = (s.charCodeAt(i) & 0xfc00) === 0xd800 && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00
    i += pair ? 2 : 1
  }
  return s.slice(0, i)
}

/** The natural sort key of text. */
export function naturalKey(text: string): string {
  const folded = text.normalize("NFKD").replace(MARKS, "").toLowerCase().replace(/[\u00df\u03c2\u13f8-\u13fd\uab70-\uabbf]/gu, foldOne)
  return cutCodePoints(folded.replace(EDGES, "").replace(DIGIT_RUN, runKey), KEY_RUNES)
}

/** Two keys in code point order (a string's < compares UTF-16 units, which puts U+10000 and up before U+E000 to U+FFFF). */
export function compareKeys(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i)
    const y = b.charCodeAt(i)
    if (x === y) continue
    // A surrogate on either side: compare whole code points.
    if ((x & 0xf800) === 0xd800 || (y & 0xf800) === 0xd800) return (a.codePointAt(i) ?? 0) - (b.codePointAt(i) ?? 0)
    return x - y
  }
  return a.length - b.length
}
