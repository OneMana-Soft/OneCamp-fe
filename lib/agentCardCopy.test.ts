import { describe, expect, it } from "vitest"
import { abilitiesPhrase, autonomyPhrase, reachPhrase, sponsorName, weekPhrase } from "@/lib/agentCardCopy"

describe("agent card copy", () => {
  it("names the sponsor by first name, and says so when unknown", () => {
    expect(sponsorName({ sponsor: "Priya Nair" })).toBe("Priya")
    expect(sponsorName({ sponsor: "" })).toBe("its sponsor")
  })

  it("reads an unknown autonomy as asking first, never as acting alone", () => {
    expect(autonomyPhrase("auto")).toBe("Acts on its own")
    expect(autonomyPhrase("something-new")).toBe("Asks before it changes anything")
  })

  it("says where it is confined, or that it is not", () => {
    expect(reachPhrase({ scoped_channels: 1, scoped_projects: 2, sponsor: "Priya" })).toBe("Only in 1 channel and 2 projects")
    expect(reachPhrase({ scoped_channels: 0, scoped_projects: 0, sponsor: "Priya" })).toBe("Anywhere Priya can act")
  })

  it("lists abilities, folding a long list", () => {
    const label = (t: string) => t.replace(/_/g, " ")
    expect(abilitiesPhrase({ tools: [], sponsor: "Priya" }, label)).toBe("Anything Priya can do")
    expect(abilitiesPhrase({ tools: ["a", "b", "c", "d", "e"], sponsor: "" }, label)).toBe("a, b, c and 2 more")
  })

  it("puts refusals in the week line only when there were any", () => {
    expect(weekPhrase({ runs: 12, actions: 1, refusals: 0, window_days: 7 })).toBe("12 runs · 1 change")
    expect(weekPhrase({ runs: 1, actions: 0, refusals: 3, window_days: 7 })).toBe("1 run · 0 changes · 3 refused")
    expect(weekPhrase({ runs: 0, actions: 0, refusals: 0, window_days: 7 })).toBe("Has not run in the last 7 days")
  })
})

describe("toolLabel", () => {
  it("labels an unknown tool as words", async () => {
    const { toolLabel } = await import("@/services/agentService")
    expect(toolLabel("search_messages")).toBe("Search messages")
    expect(toolLabel("")).toBe("")
  })
})
