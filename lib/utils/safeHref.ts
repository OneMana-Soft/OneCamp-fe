// Whether a link's href is safe to put in the page and follow on a click.
//
// WHY. Rich messages and docs are shown by the editor, read-only, and a click
// on one of their links follows it. A link written as "java&#x09;script:…"
// reaches the page as "java<tab>script:…", which no check for "javascript:"
// matches, and the browser drops the tab when it follows the link, so the
// script runs as the reader. So the scheme is found the way a browser would
// find it, only more eagerly: with every control character and space taken
// out (the browser takes out tabs and newlines anywhere, and spaces and
// control characters at either end), and again with any character references
// still in the text decoded, in case something decodes them later.
//
// Allowed: web links (http, https), email (mailto), phone (tel), and links with
// no scheme at all: the app's own paths ("/app/doc/…"), fragments ("#notes"),
// queries and relative paths. Anything else is not a link.

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"])

// Controls (C0, DEL, C1) and every space-like or invisible character a scheme
// could be hidden behind. Taken out only to find the scheme; an href that
// passes is kept as written.
const IGNORED = /[\u0000-\u0020\u007f-\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/g

// A scheme as the URL standard reads one: a letter, then letters, digits, "+",
// "-" or ".", up to the first ":".
const SCHEME = /^([a-z][a-z0-9+.-]*):/i

// Named references that can stand for a character a scheme is made of, or one
// the browser ignores in it. Any other named reference is removed outright,
// which only ever makes a scheme easier to find.
const NAMED: Record<string, string> = {
  amp: "&",
  colon: ":",
  tab: "\t",
  newline: "\n",
  nbsp: "\u00a0",
  plus: "+",
  period: ".",
  hyphen: "-",
  dash: "-",
  sol: "/",
  num: "#",
  quest: "?",
}

function fromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ""
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ""
  }
}

// One round of decoding character references, as HTML would in an attribute
// (numeric references need no closing ";" there).
function decodeOnce(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (_, name: string) => NAMED[name.toLowerCase()] ?? "")
}

function schemeOf(s: string): string | null {
  const m = s.replace(IGNORED, "").match(SCHEME)
  return m ? m[1].toLowerCase() : null
}

// A real link is encoded once, sometimes twice. One still decoding after this
// many rounds is not a link anyone wrote, and stopping bounds the work a
// message full of them can cost a reader.
const MAX_DECODES = 8

/**
 * True when `href` is a link the app may render and follow: http, https,
 * mailto or tel, or one with no scheme (relative, fragment, the app's paths).
 * Empty or non-string hrefs are not links. Pure.
 */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string" || href.trim() === "") return false
  let candidate = href
  for (let round = 0; ; round++) {
    const scheme = schemeOf(candidate)
    if (scheme !== null && !ALLOWED_SCHEMES.has(scheme)) return false
    const next = decodeOnce(candidate)
    if (next === candidate) return true
    if (round === MAX_DECODES) return false
    candidate = next
  }
}
