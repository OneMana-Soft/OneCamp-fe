// What a call says to a screen reader (calls meet-18, D-CL-11): one short
// sentence per change, joins and leaves within a moment said as one; hands'
// words are lib/calls/hands', and knocks' the knock bar's (lib/calls/lobby
// knockNotice). Pure: components/livekit/useCallAnnouncements says them
// through lib/ui/announce.

/** People who joined or left within a moment: one or two by name, more by count. Pure. */
export function peopleChange(names: readonly string[], verb: "joined" | "left"): string {
  if (names.length === 1) return `${names[0]} ${verb}`
  if (names.length === 2) return `${names[0]} and ${names[1]} ${verb}`
  return `${names.length} people ${verb}`
}
