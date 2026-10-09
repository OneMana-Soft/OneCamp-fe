import { describe, expect, it } from "vitest"
import { fillPreview } from "./EmailSettingsCard"

// The invitation names who sent it and the workspace; the editor's preview
// fills those in as the email will, and leaves anything it doesn't know as typed.
describe("the invitation preview", () => {
  it("fills in who invited them and where", () => {
    expect(fillPreview("{{inviter_name}} invited you to join them at {{workspace_url}}.", { inviter_name: "Sam", workspace_url: "team.example.com" }))
      .toBe("Sam invited you to join them at team.example.com.")
    expect(fillPreview("{{unknown}} {{signup_link}}", { signup_link: "https://x/signup" })).toBe("{{unknown}} https://x/signup")
  })
})
