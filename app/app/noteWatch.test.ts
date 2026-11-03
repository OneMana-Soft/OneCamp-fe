import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The daily note's watch (components/ai/AgentNoteOnOpen) is ONE, above every frame the shell draws: the phone's, the
// desktop shell and a call's own (MeetingSplit). Mounted inside a frame, a move between frames ended it: on a
// computer a move into a call ended it with the note up, which then sat on the call's stage until its own time ran
// out and never came back, and a call's page opened first never asked for the note (V-385, DESIGN-BUILD-101's
// call-stage look, 3 Nov). app/app/shellRenders.test.tsx holds the shell to mounting none.
const read = (file: string) => readFileSync(join(__dirname, file), "utf8")
const mounts = (source: string) => source.match(/<AgentNoteOnOpen\s*\/>/g)?.length ?? 0

describe("the daily note's watch", () => {
  it("is mounted once, by the app's layout, beside the shell and outside it", () => {
    const layout = read("layout.tsx")
    expect(mounts(layout)).toBe(1)
    const shell = layout.slice(layout.indexOf("<LayoutContent>"), layout.indexOf("</LayoutContent>"))
    expect(shell, "the layout's shell").not.toBe("")
    expect(mounts(shell), "not inside the shell's children").toBe(0)
  })

  it("is never the shell's", () => {
    expect(mounts(read("LayoutContent.tsx"))).toBe(0)
  })
})
