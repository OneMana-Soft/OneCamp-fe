/**
 * How strong a new password looks, for the meter under the field: 0 to 4
 * segments and a word. A rough guide, not a rule: the server's only rules are
 * 8 to 72 characters. Length counts most; a mix of kinds of character adds a
 * little; a password that is one character repeated, or a run like "12345678",
 * stays weak however long it is.
 */
export type Strength = { score: 0 | 1 | 2 | 3 | 4; word: string }

const WORDS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const

export function passwordStrength(pw: string): Strength {
  if (pw.length < 8) return { score: 0, word: WORDS[0] }
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length
  const repetitive = /^(.)\1+$/.test(pw) || "0123456789abcdefghijklmnopqrstuvwxyz".includes(pw.toLowerCase())
  if (repetitive) return { score: 1, word: WORDS[1] }
  let score = 1
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  if (kinds >= 3) score++
  const s = Math.min(4, score) as Strength["score"]
  return { score: s, word: WORDS[s] }
}
