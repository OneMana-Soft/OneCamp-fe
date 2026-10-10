import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The phone's channel options: one row anatomy, and words that match the state.
//  - Notifications had no icon (its words started where the others' icons
//    do) and nested its bell button inside the row's own button.
//  - "Join call" was offered with no call running.
const src = readFileSync(join(__dirname, "channelOptionsDrawer.tsx"), "utf8")

describe("the channel options drawer", () => {
  it("gives Notifications an icon like its neighbours, and no button inside its button", () => {
    expect(src).toMatch(/icon=\{Bell\}\s+label="Notifications"/)
    expect(src).not.toContain("<NotificationBell")
  })
  it("offers to start a call, or to join one in progress", () => {
    expect(src).not.toContain('label="Join call"')
    expect(src).toContain('callActive ? "Join the call in progress" : "Start a call"')
  })
})
