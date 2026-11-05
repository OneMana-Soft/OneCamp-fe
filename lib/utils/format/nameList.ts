/**
 * People's names as a sentence reads them: "Maya", "Maya and Jonas", "Maya,
 * Jonas and Sam", then "Maya, Jonas and 2 others" once there are more than
 * `max` + 1 (all are named when only one more would be left out). total counts
 * the unnamed too (a call's guests): "2 people". Shared by the typing
 * indicator, read receipts and components/ui/peopleLine.
 */
export function nameList(names: string[], max = 2, total = 0): string {
  const [shown, rest] = nameParts(names, max, total)
  if (!shown.length) return rest ? `${rest} ${rest === 1 ? "person" : "people"}` : ""
  if (!rest) return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
  return `${shown.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`
}

/** The names nameList writes, and how many it counts instead. Pure. */
export function nameParts(names: string[], max = 2, total = 0): [string[], number] {
  const list = names.filter(Boolean)
  const all = Math.max(total, list.length)
  const shown = all <= max + 1 ? list : list.slice(0, max)
  return [shown, all - shown.length]
}
