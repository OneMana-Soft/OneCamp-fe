import { describe, expect, it } from "vitest"

import { docTemplatePayload, searchKey, searchable } from "./docHomeService"

describe("the docs home's search address", () => {
  it("carries what was typed, trimmed, and whose docs, and pages by cursor", () => {
    expect(searchKey("  launch plan ")).toBe("/doc/search?q=launch+plan")
    expect(searchKey("q4", { owner: "u-1", cursor: "MjA", limit: 20 })).toBe("/doc/search?q=q4&owner=u-1&cursor=MjA&limit=20")
  })

  it("asks only once there are two letters (the server refuses fewer)", () => {
    expect(searchable(" a ")).toBe(false)
    expect(searchable("ab")).toBe(true)
    expect(searchable("é")).toBe(false)
    expect(searchable("éé")).toBe(true)
  })
})

describe("a doc template's payload", () => {
  it("reads the server's shape, a list's preview and a template's own body", () => {
    const p = docTemplatePayload({ name: "Meeting notes", payload: JSON.stringify({ title: "Meeting notes", preview: "<h2>Agenda</h2>", builtin: true, hue: "sky", glyph: "list-todo", category: "Meetings" }) })
    expect(p).toEqual({ title: "Meeting notes", body: undefined, preview: "<h2>Agenda</h2>", builtin: true, hue: "sky", glyph: "list-todo", category: "Meetings" })
  })

  it("falls back to the template's name, and a template stored badly reads as one with no tile", () => {
    expect(docTemplatePayload({ name: "Hiring debrief", payload: "{}" })).toMatchObject({ title: "Hiring debrief", builtin: false })
    expect(docTemplatePayload({ name: "Broken", payload: "{not json" })).toEqual({ title: "Broken", builtin: false })
  })
})
