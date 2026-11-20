import { describe, expect, it } from "vitest"
import { FORMER_MEMBER, memberNames, nameOf, rotaPath, rotaTurns } from "@/lib/work/triageRota"

// linear-21 H4: a project's triage rota names people by id (business/Triage RotaView). The one join
// from an id to a name, read from the project's people the page already has (the members list
// ProjectRulesDialog reads), shared by the queue's on-duty line and the settings' rota.
describe("the rota's names", () => {
  const members = [
    { user_uuid: "ana", user_name: "ana", user_full_name: "Ana Ruiz" },
    { user_uuid: "ben", user_name: "ben.o", user_full_name: "" },
    { user_uuid: "", user_name: "nobody" },
  ]

  it("finds each id's name as the rest of the app names people (lib/personName displayNameOf): the display name, else the full name", () => {
    const names = memberNames([...members, { user_uuid: "kai", user_name: "", user_full_name: "Kai Moss" }])
    expect(nameOf("ana", names)).toBe("ana")
    expect(nameOf("ben", names)).toBe("ben.o")
    expect(nameOf("kai", names)).toBe("Kai Moss")
  })

  it("never shows a raw id for someone no longer in the project", () => {
    expect(nameOf("6f1c-gone", memberNames(members))).toBe(FORMER_MEMBER)
    expect(FORMER_MEMBER).toBe("a former member")
    expect(nameOf("ana", memberNames(null))).toBe(FORMER_MEMBER)
  })

  it("lays the turns out in order, marking who is on now; an empty rota has none", () => {
    const names = memberNames(members)
    expect(rotaTurns({ people: ["ben", "ana", "gone"], on_duty: "ana" }, names)).toEqual([
      { id: "ben", name: "ben.o", now: false },
      { id: "ana", name: "ana", now: true },
      { id: "gone", name: FORMER_MEMBER, now: false },
    ])
    expect(rotaTurns({ people: [], on_duty: "" }, names)).toEqual([])
    expect(rotaTurns({ people: null, on_duty: "" }, names)).toEqual([])
    expect(rotaPath("p1")).toBe("/project/p1/triage/rota")
  })
})
