import { describe, expect, it } from "vitest"
import { DEFAULT_SUBJECT, fillPreview, subjectPreview } from "./EmailSettingsCard"

// The invitation names who sent it and the workspace; the editor's preview
// fills those in as the email will, and leaves anything it doesn't know as typed.
describe("the invitation preview", () => {
  it("fills in who invited them and where", () => {
    expect(fillPreview("{{inviter_name}} invited you to join them at {{workspace_url}}.", { inviter_name: "Sam", workspace_url: "team.example.com" }))
      .toBe("Sam invited you to join them at team.example.com.")
    expect(fillPreview("{{unknown}} {{signup_link}}", { signup_link: "https://x/signup" })).toBe("{{unknown}} https://x/signup")
  })
})

// The inviter's name is in the body, never the subject: a display name is
// whatever its owner typed, and the subject shows before the email is opened.
describe("the invitation's subject", () => {
  it("never carries the inviter's own name", () => {
    expect(DEFAULT_SUBJECT).not.toContain("{{inviter_name}}")
    expect(subjectPreview(DEFAULT_SUBJECT, "team.example.com")).toBe("You're invited to join team.example.com on OneCamp")
    expect(subjectPreview("{{inviter_name}} invited you", "team.example.com")).toBe("A teammate invited you")
  })
})
