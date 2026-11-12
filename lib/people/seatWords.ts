/**
 * What the plan's seat meter says: "14 of 25", or at 90 % or more how many
 * places are left. Pure. Kept apart from the people settings (PeopleFrame), so
 * the invite form in the shell can say it without bringing the settings in.
 */
export function seatWords(used: number, limit: number): { words: string; near: boolean; ratio: number } {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0
  const left = Math.max(0, limit - used)
  const near = ratio >= 0.9
  const words = near ? (left === 0 ? "No places left" : `${left} ${left === 1 ? "place" : "places"} left`) : `${used} of ${limit}`
  return { words, near, ratio }
}

/** Whether the limit note is due: the plan 80% full or more, or people about to be added who won't fit. Pure. */
export function seatNoteDue(used: number, limit: number, sending = 0): boolean {
  return limit > 0 && (used / limit >= 0.8 || sending > Math.max(0, limit - used))
}

/**
 * "3 places left on the free plan. 2 of these won't fit.", when the people
 * about to be added don't fit the places left; "" while they do, or when
 * there is no limit (seatsLeft unknown). Pure.
 */
export function seatOverflowLine(sending: number, seatsLeft: number | undefined): string {
  if (seatsLeft == null || sending <= seatsLeft) return ""
  const places = seatsLeft === 1 ? "1 place" : `${seatsLeft} places`
  return `${seatsLeft === 0 ? "No places" : places} left on the free plan. ${sending - seatsLeft} of these won't fit.`
}
