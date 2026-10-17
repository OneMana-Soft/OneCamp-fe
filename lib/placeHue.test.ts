import { describe, expect, it } from "vitest"

import { hueFor } from "@/lib/campHue"
import { docHue } from "@/lib/docLook"
import { placeHue } from "@/lib/placeHue"
import { projectHue } from "@/lib/projectHue"
import { personHue } from "@/lib/utils/getAvatarColor"

// One hue function for a place (D13): each kind keeps its rule, and every
// surface (the sidebar, the rail, the palette, search, Later, Home) asks here.
describe("a place's hue", () => {
  it("is a channel's id's: channels can't pick a colour yet", () => {
    expect(placeHue("channel", "c1")).toBe(hueFor("c1"))
    expect(placeHue("channel", "")).toBeUndefined()
  })

  it("is a doc's glyph colour, else its id's, and none for grey", () => {
    expect(placeHue("doc", "d1")).toBe(docHue("d1"))
    expect(placeHue("doc", "d1", { icon: "glyph:rocket:sun" })).toBe("sun")
    expect(placeHue("doc", "d1", { icon: "glyph:rocket:gray" })).toBeUndefined()
  })

  it("is a project's own, a person's avatar hue and the agent's", () => {
    expect(placeHue("project", "p1")).toBe(projectHue("p1"))
    expect(placeHue("person", null, { person: { user_uuid: "u1", user_name: "Maya Chen" } })).toBe(personHue("Maya Chen"))
    expect(placeHue("person", null, { person: "Maya Chen" })).toBe(personHue("Maya Chen"))
    expect(placeHue("agent")).toBe("agent")
  })

  it("is none for a thing with no identity", () => {
    for (const kind of ["task", "board", "team", "file", undefined]) expect(placeHue(kind, "x")).toBeUndefined()
  })
})
