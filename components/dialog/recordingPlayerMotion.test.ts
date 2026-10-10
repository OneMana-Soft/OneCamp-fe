import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The recording player's transcript panel transitioned width, height,
// margins and padding when full screen changed, laying the dialog out on
// every frame of the change (the fluidity pass's motionCost guard counted it).

describe("the recording player", () => {
  it("lets its transcript panel's size snap, and transitions only colour", () => {
    const src = readFileSync("components/dialog/RecordingPlayerDialog.tsx", "utf8")
    const lists = [...src.matchAll(/transition-\[([^\]]+)\]/g)].map((m) => m[1])
    const layout = /^(width|height|(min|max)-(width|height)|margin|padding)/
    expect(lists.flatMap((l) => l.split(",")).filter((p) => layout.test(p.trim()))).toEqual([])
  })
})
