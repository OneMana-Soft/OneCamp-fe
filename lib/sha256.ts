/**
 * sha256Hex mirrors the server's helpers.SHA256Hex so a fingerprint taken here
 * can be compared with one taken there.
 *
 * It exists for one comparison: a run records the fingerprint of each skill's
 * text as it stood at the time, and the run viewer wants to say whether that
 * skill has been edited since. Doing it in the browser keeps the comparison out
 * of the skills API, which has no other reason to hand out hashes.
 *
 * Returns null rather than throwing when SubtleCrypto is unavailable, which is
 * the case on a plain http origin. The caller then simply shows no "edited
 * since" marks instead of showing wrong ones.
 */
export async function sha256Hex(text: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null
  try {
    const bytes = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  } catch {
    return null
  }
}
