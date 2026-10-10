import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { campColour, collaboratorColour } from "./boardColours"

describe("a collaborator's pointer on a board", () => {
  it("is their identity hue's strong cut, the same on every screen", () => {
    const id = "289b6b5d-c30c-427a-bcec-634cb294f285"
    expect(collaboratorColour(id).background).toBe(campColour(hueFor(id)))
    expect(collaboratorColour(id)).toEqual(collaboratorColour(id))
    expect(collaboratorColour(id).background).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
