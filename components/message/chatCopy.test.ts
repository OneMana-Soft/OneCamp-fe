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
  it.each(["components/rightPanel/channelComments.tsx", "components/conversation/ChannelRows.tsx", "components/mobilePost/mobilePost.tsx", "components/message/deleteConfirm.tsx"])(
    "%s never calls a message a post",
    (f) => expect(read(f)).not.toMatch(/Delete this post\?|"Delete post"/),
  )
  // Asked in place where Delete was chosen (DeleteConfirm: a computer's More
  // menu, a phone's sheet), and in a phone thread's dialog.
  it("asks to delete a message, as its menu says", () => {
    expect(read("components/message/deleteConfirm.tsx")).toContain('aria-label="Delete this message?"')
    expect(read("components/mobilePost/mobilePost.tsx")).toContain('title: "Delete this message?"')
  })
  it("names a message that could not be drawn in plain words", () => {
    expect(read("components/message/baseMessageCard.tsx")).not.toContain("Editor Error")
  })
  // One picker adds someone to a project, a team or a channel (SA-3).
  it("says Add member when it adds someone", () => {
    expect(read("components/combobox/addMemberCombobox.tsx")).toContain("Add member")
    expect(read("components/combobox/addMemberCombobox.tsx")).not.toMatch(/\bAdd Member\b/)
  })
})
