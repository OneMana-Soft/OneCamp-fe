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
