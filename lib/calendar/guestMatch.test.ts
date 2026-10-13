import { describe, expect, it } from "vitest"
import { matchName, nameFit } from "./guestMatch"

// CAL-BUG-10: a typed name invites only a person who has it as a name.
const rivera = { uuid: "r", name: "Sam Rivera" }
const okafor = { uuid: "o", name: "Sam Okafor" }
const samantha = { uuid: "s", name: "Samantha Lee" }

describe("a name typed after 'with'", () => {
  it("fits a person who has it as a whole name, ignoring case and accents", () => {
    expect(nameFit("sam", "Sam Rivera")).toBe("whole")
    expect(nameFit("Rivera", "Sam Rivera")).toBe("whole")
    expect(nameFit("Jose", "José Martín")).toBe("whole")
    expect(nameFit("Sam", "Samantha Lee")).toBe("start")
    expect(nameFit("Mum", "Sam Rivera")).toBeNull()
  })

  it("is found when exactly one person has it", () => {
    expect(matchName("Sam", [rivera, samantha])).toEqual({ state: "found", person: rivera })
  })

  it("asks when two people have it, or only someone whose name starts with it", () => {
    expect(matchName("Sam", [rivera, okafor, samantha])).toEqual({ state: "choose", options: [rivera, okafor, samantha] })
    expect(matchName("Sam", [samantha])).toEqual({ state: "choose", options: [samantha] })
  })

  it("is nobody's when no one has it, and counts a person once", () => {
    expect(matchName("Mum", [rivera])).toEqual({ state: "none" })
    expect(matchName("Sam", [rivera, rivera])).toEqual({ state: "found", person: rivera })
  })
})
