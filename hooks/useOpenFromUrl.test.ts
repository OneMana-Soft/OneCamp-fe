import { describe, expect, it } from "vitest"
import { openableFromUrl } from "./useOpenFromUrl"

describe("openableFromUrl", () => {
  it("opens the creation dialogs a link may ask for", () => expect(openableFromUrl("createProject")).toBe("createProject"))
  it("ignores anything else", () => {
    expect(openableFromUrl("editProjectMember")).toBeNull()
    expect(openableFromUrl(null)).toBeNull()
  })
})
