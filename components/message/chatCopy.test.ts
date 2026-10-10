import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The words chat's screens use for their own things, in sentence case.
//  - A channel's messages are "messages" in the menu (Edit message, Delete
//    message); the confirm asked "Delete this post?" with a "Delete post" button.
//  - A message that could not be drawn said "Editor Error".
//  - The project and team pickers' button said "Add Member".
const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8")

describe("chat's copy", () => {
  it.each(["components/rightPanel/channelComments.tsx", "components/channel/channelMessages.tsx", "components/mobilePost/mobilePost.tsx"])(
    "%s asks to delete a message, as its menu says",
    (f) => {
      const src = read(f)
      expect(src).not.toMatch(/Delete this post\?|"Delete post"/)
      expect(src).toContain('title: "Delete this message?"')
    },
  )
  it("names a message that could not be drawn in plain words", () => {
    expect(read("components/message/baseMessageCard.tsx")).not.toContain("Editor Error")
  })
  it.each(["components/combobox/addTeamMemberCombobox.tsx", "components/combobox/addProjectMemberCombobox.tsx"])("%s says Add member", (f) => {
    expect(read(f)).not.toMatch(/\bAdd Member\b/)
  })
})
