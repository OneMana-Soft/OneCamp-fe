/**
 * The fluidity harness's 13-field table (FLUIDITY-LEAD's workspace.mjs), for
 * budgets on what the tables grid and the phone's row list cost as they
 * scroll: the same fields and values the harness times.
 */

import type { TableField, TableRow } from "@/services/tableService"

const opts = (...ls: string[]) => JSON.stringify({ options: ls.map((label, i) => ({ label, color: ["blue", "green", "amber", "red", "teal"][i % 5] })) })

const DEFS: [string, string, string][] = [
  ["Name", "text", "{}"],
  ["Amount", "number", "{}"],
  ["Qty", "number", "{}"],
  ["Status", "select", opts("Todo", "Doing", "Blocked", "Done")],
  ["Tags", "multi_select", opts("red", "green", "blue", "gold", "teal")],
  ["Due", "date", "{}"],
  ["Done", "checkbox", "{}"],
  ["Owner", "person", "{}"],
  ["Link", "url", "{}"],
  ["Email", "email", "{}"],
  ["Notes", "text", "{}"],
  ["Total", "formula", JSON.stringify({ formula: "{Amount} * {Qty}", result: "number" })],
  ["Vendor", "relation", JSON.stringify({ relation_target: "table", table_id: "v", two_way: true, inverse_of: "", result: "" })],
]

export const FLUIDITY_FIELDS: TableField[] = DEFS.map(([name, type, config], i) => ({ id: `f${i}`, table_id: "t", name, type: type as TableField["type"], config, position: i }))

const TAGS = ["red", "green", "blue", "gold", "teal"]

/** n rows of the harness's table, r0 to r(n-1), each in its place. */
export function fluidityRows(n: number): TableRow[] {
  return Array.from({ length: n }, (_, g) => ({
    id: `r${g}`,
    table_id: "t",
    position: g,
    created_at: "",
    updated_at: "",
    values: JSON.stringify({
      f0: `Row ${g}`,
      f1: g * 1.5,
      f2: (g % 7) + 1,
      f3: ["Todo", "Doing", "Blocked", "Done"][g % 4],
      f4: [TAGS[g % 5], TAGS[(g + 2) % 5]],
      f5: `2026-0${(g % 9) + 1}-1${g % 9}`,
      f6: g % 3 === 0,
      f7: ["Asha Rao", "Ben Ortiz", "Chen Li"][g % 3],
      f8: `https://example.com/item/${g}`,
      f9: `person${g}@example.com`,
      f10: `Notes for row ${g}`,
      f11: g * 1.5 * ((g % 7) + 1),
      f12: [{ id: `v${g % 100}`, label: `V${g % 100}`, type: "table", table_id: "v" }],
    }),
  }))
}
