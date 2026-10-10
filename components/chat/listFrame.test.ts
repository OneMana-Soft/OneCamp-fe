import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Channels and DMs sit under one tab bar on a phone, so their lists share a
// frame: rows 8px in (px-2), 8px from the top (py-2). DM rows were 4px in and
// 6px down, so a DM's face sat 4px left of a channel's tile.
const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("the phone's Channels and DMs lists share a frame", () => {
  it("pads both lists the same", () => {
    const dms = /data-list-frame="" className="([^"]+)"/.exec(read("components/chat/chatUserList.tsx"))?.[1] ?? ""
    expect(dms.split(/\s+/)).toEqual(expect.arrayContaining(["px-2", "py-2"]))
    const container = read("components/ui/pageContainer.tsx")
    const channels = read("components/channel/chnnelListResult.tsx")
    expect(container).toMatch(/"w-full h-full px-2 md:px-4"/)
    expect(channels).toMatch(/<PageContainer className="[^"]*\bpy-2\b/)
  })

  it("says what failed in sentence case", () => {
    expect(read("components/chat/chatUserList.tsx")).not.toMatch(/Chat List Error/)
  })
})
