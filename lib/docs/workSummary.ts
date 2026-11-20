/** "12 docs, 2 boards and 3 links" (business/Departed Work): what someone has of each. */
export function workSummary(docs: number, boards: number, links: number): string {
  const parts = ([[docs, "doc"], [boards, "board"], [links, "link"]] as const).filter(([n]) => n > 0).map(([n, one]) => `${n} ${one}${n === 1 ? "" : "s"}`)
  if (parts.length === 0) return `${links} links`
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
