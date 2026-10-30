import { describe, expect, it } from "vitest"
import { answerProblem, checkAnswers, firstProblem, isPhone } from "./answers"
import type { FormField } from "./forms"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Answers checked as business/Form's CheckAnswers checks them, in its words,
// so a page says what's wrong before anything is sent. The cases are
// branch_test.go's TestMoreKindsOfQuestion and form_test.go's.

const form: FormField[] = [
  { id: "what", label: "What do you need?", type: "short_text", required: true },
  { id: "kind", label: "Kind", type: "select", required: true, options: ["Bug", "Idea"] },
  { id: "steps", label: "Steps to reproduce", type: "long_text", required: true, show_if: { question: "kind", op: "is", values: ["Bug"] } },
  { id: "areas", label: "Areas", type: "multi_select", required: false, options: ["Web", "Phone", "API"] },
  { id: "site", label: "Where it happens", type: "url", required: false, show_if: { question: "areas", op: "any_of", values: ["Web"] } },
  { id: "phone", label: "Phone", type: "phone", required: false },
]

describe("more kinds of question, read strictly (TestMoreKindsOfQuestion)", () => {
  const base = (k: string, v: unknown) => ({ what: "x", kind: "Bug", steps: "y", areas: ["Web"], [k]: v })

  it("refuses what the server refuses", () => {
    for (const raw of [
      base("areas", ["Desk"]),
      base("areas", "Web"),
      base("site", "ftp://example.com"),
      base("site", "javascript:alert(1)"),
      base("site", "example.com"),
      base("phone", "call me"),
      base("phone", "12"),
    ]) {
      expect(checkAnswers(form, raw).problem, JSON.stringify(raw)).not.toBeNull()
    }
  })

  it("says why, in the server's words", () => {
    expect(checkAnswers(form, base("areas", ["Desk"])).problem?.message).toBe("Pick from the choices for “Areas”.")
    expect(checkAnswers(form, base("areas", "Web")).problem?.message).toBe("“Areas” isn't answered the right way.")
    expect(checkAnswers(form, base("site", "example.com")).problem?.message).toBe("“Where it happens” needs a link that starts with https://.")
    expect(checkAnswers(form, base("phone", "12")).problem?.message).toBe("“Phone” needs a phone number.")
  })

  it("keeps a phone number as it was written, and a choice picked twice once", () => {
    const kept = (raw: Record<string, unknown>) => Object.fromEntries(checkAnswers(form, raw).kept.map((a) => [a.id, a.value]))
    expect(kept(base("phone", "+1 (555) 010-2000")).phone).toBe("+1 (555) 010-2000")
    expect(kept(base("areas", ["Web", "Web", "API"])).areas).toBe("Web, API")
  })
})

describe("one answer, checked", () => {
  const q = (type: FormField["type"], over: Partial<FormField> = {}): FormField => ({ id: "a", label: "Answer", type, required: false, ...over })

  it("asks for a required answer, and a required box to be ticked", () => {
    expect(answerProblem(q("short_text", { required: true }), "  ")).toBe("“Answer” needs an answer.")
    expect(answerProblem(q("short_text"), "")).toBe("")
    expect(answerProblem(q("checkbox", { required: true }), false)).toBe("“Answer” needs to be ticked.")
    expect(answerProblem(q("checkbox"), false)).toBe("")
    expect(answerProblem(q("multi_select", { required: true, options: ["A", "B"] }), [])).toBe("“Answer” needs an answer.")
  })

  it("holds each kind to the server's length", () => {
    expect(answerProblem(q("short_text"), "x".repeat(300))).toBe("")
    expect(answerProblem(q("short_text"), "x".repeat(301))).toBe("Keep “Answer” under 300 characters.")
    expect(answerProblem(q("long_text"), "x".repeat(5000))).toBe("")
    expect(answerProblem(q("long_text"), "x".repeat(5001))).toBe("Keep “Answer” under 5000 characters.")
    // Characters, not bytes: an emoji is one.
    expect(answerProblem(q("short_text"), "🙂".repeat(300))).toBe("")
  })

  it("takes an email address only with a domain that has a dot", () => {
    expect(answerProblem(q("email"), "ana@example.com")).toBe("")
    expect(answerProblem(q("email"), "ana@example")).toBe("“Answer” needs an email address like name@example.com.")
    expect(answerProblem(q("email"), "ana")).toBe("“Answer” needs an email address like name@example.com.")
  })

  it("takes a date as a day, a choice from the list, and a web link", () => {
    expect(answerProblem(q("date"), "2026-11-02")).toBe("")
    expect(answerProblem(q("date"), "02/11/2026")).toBe("“Answer” needs a date.")
    expect(answerProblem(q("date"), "2026-02-30")).toBe("“Answer” needs a date.")
    expect(answerProblem(q("select", { options: ["Bug"] }), "Desk")).toBe("Pick one of the choices for “Answer”.")
    expect(answerProblem(q("url"), "http://intranet.example/page")).toBe("")
    expect(answerProblem(q("url"), "https://")).toBe("“Answer” needs a link that starts with https://.")
  })

  it("reads a phone number as people write one: 5 to 20 digits, spaces and + - ( ) . /", () => {
    expect(isPhone("+44 20 7946 0958")).toBe(true)
    expect(isPhone("(555) 010.2000 / 12")).toBe(true)
    expect(isPhone("1234")).toBe(false)
    expect(isPhone("1".repeat(21))).toBe(false)
    expect(isPhone("555-CALL")).toBe(false)
  })
})

// A number answer is read as its sender writes numbers: "1,5" from Berlin is
// one and a half; in en-US's signs it isn't a number at all (a comma groups
// digits there), and is said so before anything is sent.
describe("number answers in the sender's signs", () => {
  const fields: FormField[] = [{ id: "seats", label: "Seats", type: "number", required: false }]
  it("takes a number as a German visitor writes it", () => {
    expect(firstProblem(fields, { seats: "1,5" }, "de-DE")).toBeNull()
    expect(firstProblem(fields, { seats: "1.234,5" }, "de-DE")).toBeNull()
  })
  it("says which answer isn't a number, in the server's words", () => {
    expect(firstProblem(fields, { seats: "1,5" }, "en-US")).toEqual({ id: "seats", message: "“Seats” needs a number." })
    expect(firstProblem(fields, { seats: "12 kg" }, "de-DE")?.message).toBe("“Seats” needs a number.")
  })
  it("leaves an empty answer to the required check", () => {
    expect(firstProblem(fields, { seats: "  " }, "de-DE")).toBeNull()
    expect(firstProblem(fields, {}, "de-DE")).toBeNull()
  })
})
