import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Every view of the right panel opens under the one 48px header, so the
// panel's top doesn't move when it switches from one to another. The doc AI
// view had a 65px header of its own. (The task panel has its own 48px header
// with Mark complete; the event view moves its actions into this one.)
const root = join(__dirname, "..", "..")
describe("the right panel's views share one header", () => {
  it.each([
    "components/rightPanel/channelComments.tsx",
    "components/rightPanel/chatComments.tsx",
    "components/rightPanel/groupChatComments.tsx",
    "components/rightPanel/docCommentList.tsx",
  ])("%s", (f) => {
    expect(readFileSync(join(root, f), "utf8")).toMatch(/<RightPanelHeader\b/)
  })
})
