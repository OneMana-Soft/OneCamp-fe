/** Head 9's static part; the rest loads with the answer (repeats.ts). */
export const CHECK_IN = "checkin-"

/** "" past the server's 62 days. */
export function repeatsPath(from: Date, to: Date): string {
  return +to > +from && +to - +from <= 62 * 864e5 ? `/calendar/repeats?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}` : ""
}

export const taskOfAhead = (id: string) => id.split("@")[0]

/** A check-in id's channel, else null. */
export function checkInChannel(id: string): string | null {
  const c = id.startsWith(CHECK_IN) ? id.slice(8, 44) : ""
  return /^[0-9a-f-]{36}$/i.test(c) ? c : null
}
