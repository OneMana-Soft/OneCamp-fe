/**
 * A secret stored next to an address is bound to that address.
 *
 * The forms for an MCP server and a remote agent never show a stored secret,
 * so leaving the field blank keeps it. That is right for a rename, and was how
 * one save sent an admin's token to whatever new address was typed. The server
 * now refuses to keep a secret when its destination moves (helpers.SecretMoves
 * in the backend): another scheme, host or port, or a different way of
 * attaching it. This is the same rule, so the form asks for the secret again
 * exactly when the server would refuse to keep it. testdata/secret_destination.json
 * holds the cases both sides run.
 */

/** Where a stored secret goes, and how it is attached (an auth type, a header name). */
export interface SecretDestination {
  url: string
  how?: string[]
}

/** The 400 code the server answers when a kept secret would move. */
export const SECRET_REENTRY_CODE = "secret_reentry"

/** What the person reads under the secret field, naming it as the form does. */
export function secretReentryHint(noun = "token"): string {
  return `Enter the ${noun} again for the new address.`
}

interface Origin {
  scheme: string
  host: string
  port: string
}

const DEFAULT_PORTS: Record<string, string> = { http: "80", https: "443", ws: "80", wss: "443" }

/** An address's scheme, host and port, normalised; null when it has no host. */
function originOf(raw: string): Origin | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase()
  // IPv6 hosts come back bracketed; the server compares them bare.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (!host) return null
  return { scheme, host, port: u.port || DEFAULT_PORTS[scheme] || "" }
}

function sameHow(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => x.trim().toLowerCase() === (b[i] ?? "").trim().toLowerCase())
}

/**
 * Whether a secret kept for `from` would reach somewhere new at `to`. An
 * address that doesn't parse counts as moved; no address on either side is the
 * surface's built-in one, so only how it is sent can move it then.
 */
export function secretMoves(from: SecretDestination, to: SecretDestination): boolean {
  if (!from.url.trim() && !to.url.trim()) return !sameHow(from.how, to.how)
  const a = originOf(from.url)
  const b = originOf(to.url)
  if (!a || !b || a.scheme !== b.scheme || a.host !== b.host || a.port !== b.port) return true
  return !sameHow(from.how, to.how)
}
