/**
 * Choices as a sentence offers them: "A", "A or B", "A, B or C". A rule's
 * fields and people, a form's condition and the files a sheet import takes
 * all say it this one way.
 */
export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
}
