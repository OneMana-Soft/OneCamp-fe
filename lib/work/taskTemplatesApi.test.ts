import { describe, expect, it } from "vitest"
import { readAsks } from "./taskTemplatesApi"

// Task templates' calls (linear-09; router/taskTemplates.go): a make the
// server refused for what the template asks for, read from its 422.

describe("a make the server refused for what it asks for", () => {
  it("reads the properties still to fill and what it left off", () => {
    const err = { response: { status: 422, data: { msg: "Fill in what this template asks for first.", missing: ["due", "field:f1"], left_off: ["Owner"] } } }
    expect(readAsks(err)).toEqual({ missing: ["due", "field:f1"], leftOff: ["Owner"] })
  })
  it("is nothing for any other failure", () => {
    expect(readAsks({ response: { status: 403, data: { msg: "No." } } })).toBeNull()
    expect(readAsks({ response: { status: 422, data: { msg: "That value doesn't fit." } } })).toBeNull()
    expect(readAsks(new Error("offline"))).toBeNull()
  })
})
