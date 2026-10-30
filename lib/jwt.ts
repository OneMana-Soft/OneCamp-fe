// A JWT's claims, read on the client. Nothing here checks a signature: the
// server that issued the token checks it, and the client only reads what the
// token says (when it expires, who it names).

/**
 * A JWT's claims, or null when the token can't be read. The payload is
 * base64url-encoded UTF-8, so a name like "Zoë" comes out whole. Pure.
 */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1]
  if (!part) return null
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))
    const claims: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))))
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}
