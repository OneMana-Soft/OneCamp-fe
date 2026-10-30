import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// asana-12 (a): a task opens whole with no network only when every part the panel draws on a chunk of its own came
// to the device with the panel's code (warmTaskParts). The tag picker was left out, and a task opened offline said
// "Couldn't load the tag picker" in its place. The statuses dialog comes when a press opens it, so it isn't warmed.
const PANEL = readFileSync("components/rightPanel/taskInfoPanel.tsx", "utf8")
const ON_PRESS = ["ProjectStatusesDialog"]

describe("a task panel's parts", () => {
  it("all come to the device with the panel's code, but those a press opens", () => {
    const parts = [...PANEL.matchAll(/^const (\w+) = lazy(?:Part|Piece)\b/gm)].map((m) => m[1])
    const warmed = /export const warmTaskParts = \(\) =>\s*Promise\.all\(\[([^\]]*)\]\)/.exec(PANEL)?.[1] ?? ""
    expect(parts).toEqual(expect.arrayContaining(["tagPicker", "cycleField", "milestoneField", "approvalCard", "TaskVisibilityRow"]))
    expect(parts.filter((part) => !ON_PRESS.includes(part) && !warmed.includes(`${part}.warm()`))).toEqual([])
  })
})
