// A page's password and a room's passcode are one kind of secret, under the
// server's one rule (audit A8: business/Guest/publish.go, SecretProblem).
// secret.test.ts holds these numbers and words to the server's own whenever it
// can read a backend checkout, so the two can't drift apart again: a room's
// field once said "at least 4" while the server refused anything under 6.

/** A new secret's fewest and most characters. */
export const SECRET_LENGTH = { shortest: 6, longest: 128 } as const

/** A new secret's field hint. */
export const SECRET_HINT = `At least ${SECRET_LENGTH.shortest} characters`

/**
 * What is wrong with a new password or passcode, in the server's words, or ""
 * when it may be set. Characters count as the server counts them, not as
 * UTF-16 units. Pure.
 */
export function secretProblem(noun: "password" | "passcode", secret: string): string {
  const n = [...secret].length
  return n < SECRET_LENGTH.shortest || n > SECRET_LENGTH.longest ? `A ${noun} is ${SECRET_LENGTH.shortest} to ${SECRET_LENGTH.longest} characters.` : ""
}
