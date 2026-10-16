// Writing CSV a spreadsheet opens as written: RFC 4180 quoting, and text a
// spreadsheet would run as a formula kept as text, with a ' before it
// (OWASP, "CSV Injection": a leading = + - @, tab, carriage return or line
// feed, or the full-width ＝ ＋ － ＠). A number is written as a number, so
// -120 never becomes the text '-120 (TAB-BUG-11). Pure.

const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/

/** One cell: a number as it is; text quoted where it must be, and kept as text when it starts like a formula. */
export function csvCell(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  const formula = FORMULA_START.test(value)
  return formula || /[",\r\n]/.test(value) ? `"${formula ? "'" : ""}${value.replace(/"/g, '""')}"` : value
}

/** A line of cells. */
export function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",")
}
