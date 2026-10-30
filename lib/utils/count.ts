/** A number with its noun: "1 error", "3 errors", "1,204 messages". Pure. */
export function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`
}
