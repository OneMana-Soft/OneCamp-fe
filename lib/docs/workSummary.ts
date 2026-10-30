/** "12 docs and 3 links" (business/Departed Summary). */
export function workSummary(docs: number, links: number): string {
  const part = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)
  if (docs > 0 && links > 0) return `${part(docs, "doc", "docs")} and ${part(links, "link", "links")}`
  if (docs > 0) return part(docs, "doc", "docs")
  return part(links, "link", "links")
}
