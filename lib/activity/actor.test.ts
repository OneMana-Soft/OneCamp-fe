import { describe, expect, it } from "vitest"
import { actorFilters, matchesActor, parseActorFilter } from "./actor"

describe("activity actor filter", () => {
  it("counts an item without a kind as a person's", () => {
    expect(matchesActor({}, "person")).toBe(true)
    expect(matchesActor({}, "agent")).toBe(false)
  })
  it("keeps everything for everyone", () => expect(matchesActor({ actor_kind: "app" }, "everyone")).toBe(true))
  it("offers agents only with AI", () => {
    expect(actorFilters(false).map((f) => f.value)).toEqual(["everyone", "person", "app"])
    expect(actorFilters(true).map((f) => f.value)).toContain("agent")
  })
  it("reads the URL safely", () => {
    expect(parseActorFilter("agent")).toBe("agent")
    expect(parseActorFilter("robots")).toBe("everyone")
    expect(parseActorFilter(null)).toBe("everyone")
  })
})
