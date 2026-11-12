import { describe, expect, it } from "vitest"
import { FIELD_TYPES, FILTERABLE, alignsRight, readsBuiltins, typeLabel, type TaskField } from "@/lib/tasks/fields"
import { fieldText, formulaShown } from "@/lib/tasks/formulaShown"
import { inReaderZone } from "@/lib/tasks/readerZone"
import { pinTestClock } from "@/lib/testing/testClock"

// A formula's dates read the clock: pinned, not the machine's.
pinTestClock()

// A formula task field (J-F WEB, jira-01): worked out by the server from the
// task's other fields; the web only reads it.
const formula = (result: TaskField["result"], patch: Partial<TaskField> = {}): TaskField => ({
  id: "f",
  project_id: "p",
  name: "Days left",
  type: "formula",
  options: [],
  on_card: true,
  position: 0,
  filter_id: "field_f",
  formula: "DATETIME_DIFF({Due}, TODAY(), \"days\")",
  result,
  ...patch,
})

describe("a formula task field", () => {
  it("is a kind a project's admin can choose, worked out from other fields", () => {
    expect(FIELD_TYPES.find((t) => t.value === "formula")).toEqual({ value: "formula", label: "Formula", hint: "Worked out from other fields" })
    expect(typeLabel("formula")).toBe("Formula")
  })

  it("is no filter of a list (V-764)", () => {
    expect(FILTERABLE).not.toContain("formula")
  })

  it("reads as its result: a number in the reader's locale, a day, yes or no, an error, or nothing", () => {
    expect(fieldText(formula("number"), 1234.5)).toBe((1234.5).toLocaleString())
    expect(fieldText(formula("date"), "2026-11-20", undefined)).toMatch(/20 Nov/)
    expect(fieldText(formula("checkbox"), true)).toBe("Yes")
    expect(fieldText(formula("checkbox"), false)).toBe("No")
    expect(fieldText(formula("text"), "Late")).toBe("Late")
    expect(fieldText(formula("number"), { error: "Spend was deleted" })).toBe("Error")
    expect(fieldText(formula("number"), undefined)).toBe("")
    expect(formulaShown(formula("number"), { error: "Spend was deleted" })).toEqual({ kind: "error", message: "Spend was deleted" })
  })

  it("lines up on the right when it gives a number, as money and numbers do", () => {
    expect(alignsRight(formula("number"))).toBe(true)
    expect(alignsRight(formula("date"))).toBe(false)
    expect(alignsRight({ type: "money" })).toBe(true)
    expect(alignsRight({ type: "text" })).toBe(false)
  })

  it("makes a change to a task's built-ins read it again only where a formula may read them (V-762)", () => {
    expect(readsBuiltins([formula("number")])).toBe(true)
    expect(readsBuiltins([{ type: "money" }])).toBe(false)
    expect(readsBuiltins(undefined)).toBe(false)
  })
})

describe("inReaderZone", () => {
  it("asks a task read in the reader's zone, so TODAY() is their day, keeping what else it asks", () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(inReaderZone()).toEqual({ params: { tz: zone } })
    expect(inReaderZone({ suppressErrorToast: true, params: { a: 1 } })).toEqual({ suppressErrorToast: true, params: { a: 1, tz: zone } })
  })
})
