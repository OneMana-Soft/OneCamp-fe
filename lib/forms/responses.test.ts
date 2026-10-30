import { describe, expect, it } from "vitest"
import type { FormField, Submission } from "./forms"
import { summarize } from "./responses"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const fields: FormField[] = [
  { id: "what", label: "What do you need?", type: "short_text", required: true },
  { id: "kind", label: "Kind", type: "select", required: false, options: ["Copy", "Design", "A bug"] },
  { id: "areas", label: "Areas", type: "multi_select", required: false, options: ["Web", "API"] },
  { id: "s", label: "About you", type: "section", required: false },
  { id: "ok", label: "Signed", type: "checkbox", required: false },
]
const sub = (id: string, answers: Submission["answers"]): Submission => ({ id, task_uuid: `t-${id}`, created_at: "2026-10-21T05:00:00Z", answers })

describe("a form's latest answers, by question", () => {
  const subs = [
    sub("4", [{ id: "what", label: "What do you need?", value: "A banner" }, { id: "kind", label: "Kind", value: "A bug" }, { id: "areas", label: "Areas", value: "Web, API", values: ["Web", "API"] }, { id: "ok", label: "Signed", value: "Yes" }]),
    sub("3", [{ id: "what", label: "What do you need?", value: "A logo" }, { id: "kind", label: "Kind", value: "A bug" }, { id: "ok", label: "Signed", value: "No" }]),
    sub("2", [{ id: "what", label: "What do you need?", value: "Copy for the page" }, { id: "kind", label: "Kind", value: "Copy" }, { id: "areas", label: "Areas", value: "API", values: ["API"] }]),
    // From before questions had ids: read by label.
    sub("1", [{ Label: "What do you need?", Value: "A video" }, { Label: "Areas", Value: "Web" }]),
  ]
  const by = Object.fromEntries(summarize(fields, subs).map((s) => [s.id, s]))

  it("counts each choice, every choice listed in its order, none for a section", () => {
    expect(by.kind.tally).toEqual([{ choice: "Copy", count: 1 }, { choice: "Design", count: 0 }, { choice: "A bug", count: 2 }])
    expect(by.kind.answered).toBe(3)
    expect(by.s).toBeUndefined()
  })

  it("counts each of several choices, and a box as Yes and No", () => {
    expect(by.areas.tally).toEqual([{ choice: "Web", count: 2 }, { choice: "API", count: 2 }])
    expect(by.ok.tally).toEqual([{ choice: "Yes", count: 1 }, { choice: "No", count: 1 }])
  })

  it("keeps every answer in words, newest first, as many as answered", () => {
    expect(by.what.answered).toBe(4)
    expect(by.what.said).toEqual(["A banner", "A logo", "Copy for the page", "A video"])
  })
})
