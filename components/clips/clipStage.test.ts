import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Voice, Video and Screen share one stage: Voice's 112px box against the
// others' 16:9 frame resized the centred dialog on every switch, moving its
// title and the switch itself about 56px.
describe("the clip recorder's stage", () => {
  const src = readFileSync(join(__dirname, "ClipRecorder.tsx"), "utf8")
  it("is one 16:9 frame whatever is recorded", () => {
    expect(src).toMatch(/data-clip-stage="" className="[^"]*\baspect-video\b/)
    expect(src).not.toMatch(/kind === "voice" \? "h-28"/)
  })
  it("keeps two lines for its hint, so a wrapping hint moves nothing", () => {
    expect(src).toMatch(/data-clip-hint="" className=\{cn\("min-h-8/)
  })
})
