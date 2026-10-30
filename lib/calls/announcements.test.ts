import { describe, expect, it } from "vitest"
import { peopleChange } from "./announcements"

// meet-18: what the call says to a screen reader, once per change, in few words.
describe("what the call says", () => {
  it("names one or two people who joined or left together, and counts more", () => {
    expect(peopleChange(["Maya Chen"], "joined")).toBe("Maya Chen joined")
    expect(peopleChange(["Maya Chen", "Jo Park"], "left")).toBe("Maya Chen and Jo Park left")
    expect(peopleChange(["Maya Chen", "Jo Park", "Lee Hall"], "joined")).toBe("3 people joined")
  })
})
