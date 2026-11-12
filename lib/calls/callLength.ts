/** "4 min", "1 h 5 min", "under a minute": how long an ended call ran, from its seconds. The call card, a board's calls and what calls kept say it so. Pure. */
export function callLength(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 1) return "under a minute"
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`
}
