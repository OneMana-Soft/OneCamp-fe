/**
 * People's names as a sentence reads them: "Maya", "Maya and Jonas", "Maya,
 * Jonas and Sam", then "Maya, Jonas and 2 others" once there are more than
 * `max` + 1 (all are named when only one more would be left out). Used by
 * the typing indicator and read receipts, so both say it the same way.
 */
export function nameList(names: string[], max = 2): string {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list.join("")
  const shown = list.length <= max + 1 ? list : list.slice(0, max)
  const rest = list.length - shown.length
  if (rest === 0) return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
  return `${shown.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`
}
