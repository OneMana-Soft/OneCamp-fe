import { describe, expect, it } from "vitest"
import { draftOf, fieldFilterMatches, fieldIdOfFilter, formatFieldValue, parseFieldInput, parseTypedNumber, withField, type TaskField } from "./fields"

const field = (type: TaskField["type"], more: Partial<TaskField> = {}): TaskField => ({
  id: "0a1b2c3d-0000-4000-8000-000000000001",
  project_id: "p",
  name: "F",
  type,
  options: [
    { id: "aaaa1111", label: "Blog", color: "violet" },
    { id: "bbbb2222", label: "Email", color: "sky" },
  ],
  on_card: false,
  position: 0,
  filter_id: "field_0a1b2c3d000040008000000000000001",
  ...more,
})

describe("custom fields", () => {
  it("writes a value as a list cell shows it", () => {
    expect(formatFieldValue(field("select"), "bbbb2222")).toBe("Email")
    expect(formatFieldValue(field("select"), "gone1234")).toBe("")
    expect(formatFieldValue(field("multi_select"), ["bbbb2222", "aaaa1111"])).toBe("Email, Blog")
    expect(formatFieldValue(field("money", { currency: "INR" }), 1250050)).toMatch(/12,500\.50|12,500.50/)
    expect(formatFieldValue(field("date"), "2026-10-31")).toMatch(/31/)
    expect(formatFieldValue(field("url"), "https://example.com/brief")).toBe("example.com/brief")
    expect(formatFieldValue(field("checkbox"), true)).toBe("Yes")
    expect(formatFieldValue(field("person"), "u1", (id) => (id === "u1" ? "Maya Chen" : undefined))).toBe("Maya Chen")
    expect(formatFieldValue(field("text"), undefined)).toBe("")
  })

  it("reads a field's id back from its filter id", () => {
    expect(fieldIdOfFilter("field_0a1b2c3d000040008000000000000001")).toBe("0a1b2c3d-0000-4000-8000-000000000001")
    expect(fieldIdOfFilter("task_cycle")).toBeNull()
    expect(fieldIdOfFilter("field_short")).toBeNull()
  })

  it("matches a task's value against a filter as the server does", () => {
    const id = "field_0a1b2c3d000040008000000000000001"
    const fid = "0a1b2c3d-0000-4000-8000-000000000001"
    expect(fieldFilterMatches({ [fid]: "aaaa1111" }, id, ["aaaa1111", "bbbb2222"])).toBe(true)
    expect(fieldFilterMatches({ [fid]: "aaaa1111" }, id, ["bbbb2222"])).toBe(false)
    expect(fieldFilterMatches({ [fid]: ["x", "aaaa1111"] }, id, ["aaaa1111"])).toBe(true)
    expect(fieldFilterMatches({ [fid]: true }, id, ["true"])).toBe(true)
    expect(fieldFilterMatches({}, id, ["any"])).toBe(false)
    expect(fieldFilterMatches({ [fid]: "aaaa1111" }, id, ["any"])).toBe(true)
    expect(fieldFilterMatches(undefined, id, ["none"])).toBe(true)
    expect(fieldFilterMatches({ [fid]: "aaaa1111" }, id, ["none", "bbbb2222"])).toBe(false)
    expect(fieldFilterMatches({ [fid]: "aaaa1111" }, id, [])).toBe(true)
  })

  it("reads what's typed into a text-like field", () => {
    expect(parseFieldInput(field("text"), "  draft  ")).toEqual({ value: "draft" })
    expect(parseFieldInput(field("text"), "   ")).toEqual({ value: null })
    expect(parseFieldInput(field("url"), "example.com/page")).toEqual({ value: "https://example.com/page" })
    expect(parseFieldInput(field("url"), "http://intranet.example/x")).toEqual({ value: "http://intranet.example/x" })
    expect(parseFieldInput(field("url"), "not a link")).toHaveProperty("error")
    expect(parseFieldInput(field("url"), "javascript:alert(1)")).toHaveProperty("error")
    expect(parseFieldInput(field("number"), "1,250.5")).toEqual({ value: 1250.5 })
    expect(parseFieldInput(field("number"), "twelve")).toHaveProperty("error")
    expect(parseFieldInput(field("money"), "₹ 12,500.50")).toEqual({ value: 1250050 })
    expect(parseFieldInput(field("money"), "0.1")).toEqual({ value: 10 })
  })

  it("shows money in units for editing, and merges one value into the rest", () => {
    expect(draftOf(field("money"), 1250000)).toBe("12500")
    expect(draftOf(field("money"), 1250050)).toBe("12500.50")
    expect(draftOf(field("number"), 3.5)).toBe("3.5")
    expect(withField({ a: "x", b: 2 }, "a", null)).toEqual({ b: 2 })
    expect(withField({ b: 2 }, "a", ["x"])).toEqual({ a: ["x"], b: 2 })
    expect(withField(undefined, "a", [])).toEqual({})
  })
})

describe("numbers typed in", () => {
  it("refuses words and a sign alone", () => {
    expect(parseFieldInput(field("number"), "twelve")).toHaveProperty("error")
    expect(parseFieldInput(field("money"), "₹")).toHaveProperty("error")
    expect(parseFieldInput(field("money"), "$-5")).toEqual({ value: -500 })
  })
})

describe("a number typed in the reader's own way", () => {
  it("reads the locale's marks, and the other way round only when that's the one reading", () => {
    expect(parseTypedNumber("12,50", "en-US")).toBe(12.5)
    expect(parseTypedNumber("12,500.50", "en-US")).toBe(12500.5)
    expect(parseTypedNumber("1,250", "en-US")).toBe(1250)
    expect(parseTypedNumber("1.250", "en-US")).toBe(1.25)
    expect(parseTypedNumber("12,50", "de-DE")).toBe(12.5)
    expect(parseTypedNumber("12.500,50", "de-DE")).toBe(12500.5)
    expect(parseTypedNumber("1.250", "de-DE")).toBe(1250)
    expect(parseTypedNumber("12.50", "de-DE")).toBe(12.5)
    expect(parseTypedNumber("12 500,50", "fr-FR")).toBe(12500.5)
    expect(parseTypedNumber("12\u202f500,50", "fr-FR")).toBe(12500.5)
    expect(parseTypedNumber("-3,5", "de-DE")).toBe(-3.5)
  })

  it("isn't fooled into a number by stray marks", () => {
    expect(parseTypedNumber("1,2,3", "en-US")).toBeNull()
    expect(parseTypedNumber("12,5,0", "de-DE")).toBeNull()
    expect(parseTypedNumber("1.2.3", "en-US")).toBeNull()
    expect(parseTypedNumber("", "en-US")).toBeNull()
    expect(parseTypedNumber("1e5", "en-US")).toBeNull()
  })
})
