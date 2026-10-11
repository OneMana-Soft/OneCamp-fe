import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// The channel's AI teammates and AI settings are sections of the Details sheet
// like the rest (design v3 chat, C49 and C51): a sentence-case title over a
// card of 56px rows, no small uppercase heading of their own, and the settings
// save as they change, with no Save button.
const read = (f: string) => readFileSync(`components/member/${f}`, "utf8")

describe("the channel's AI sections", () => {
  it.each(["channelAITeammates.tsx", "channelAIBudget.tsx"])("%s is a Details section with no uppercase heading", (f) => {
    const src = read(f)
    expect(src).toContain("<DetailsSection")
    expect(src).not.toMatch(/uppercase/)
  })

  it("titles the teammates in sentence case", () => {
    expect(read("channelAITeammates.tsx")).toContain("title={`AI teammates · ${options.length}`}")
  })

  it("saves the model and the cap as they change, with no Save button", () => {
    const src = read("channelAIBudget.tsx")
    expect(src).toMatch(/onValueChange=\{\(v\) => \{\s*setModelId\(v\)\s*void save\(cap, v\)/)
    expect(src).toMatch(/onBlur=\{\(\) => \{ if \(dirty\) void save\(cap, modelId\) \}\}/)
    expect(src).not.toMatch(/>\s*Save\s*</)
    expect(src).toContain("<DetailsRow")
  })
})
