/**
 * A server's "isn't set up on this server" sentence, in the pieces it is read
 * by (DESIGN-BUILD-2, 20 Oct): the settings it names (UPPER_SNAKE, such as
 * BASECAMP_OAUTH_CLIENT_ID) as code, and the addresses it names
 * (launchpad.37signals.com/integrations) as links. The sentence itself is the
 * server's, word for word; only how it is set changes. Any importer's or
 * integration's setup words go through it (components/ui/setupSentence).
 */
import { WEB_LINK } from "@/lib/links/webLink"

export type SetupToken = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "link"; text: string; href: string }

// A setting: capitals and digits, at least two parts joined by underscores.
const SETTING = String.raw`\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b`
// An address: a web link in text, the one matcher (lib/links/webLink). File
// names (final-compose.yml, .env) have no path and no common domain.
const PIECE = new RegExp(`(${SETTING})|(${WEB_LINK})`, "gi")
// Punctuation that ends the sentence, not the address.
const TRAILING = /[.,;:!?)\]'"]+$/

export function setupTokens(sentence: string): SetupToken[] {
  const out: SetupToken[] = []
  let at = 0
  const text = (to: number) => {
    if (to > at) out.push({ kind: "text", text: sentence.slice(at, to) })
  }
  for (const m of sentence.matchAll(PIECE)) {
    const start = m.index ?? 0
    if (m[1] && /^[A-Z0-9_]+$/.test(m[1])) {
      text(start)
      out.push({ kind: "code", text: m[1] })
      at = start + m[1].length
    } else if (m[2]) {
      const address = m[2].replace(TRAILING, "")
      text(start)
      out.push({ kind: "link", text: address, href: /^https?:\/\//i.test(address) ? address : `https://${address}` })
      at = start + address.length
    }
  }
  text(sentence.length)
  return out
}
