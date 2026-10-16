import { describe, expect, it } from "vitest"
import { ACCESS_LEVEL_LABEL, accessReasonText, explainDocAccess } from "@/lib/docAccess"
import type { AccessReason } from "@/types/docAccess"

const REASONS: AccessReason[] = [
  "owner", "full_access", "shared_edit", "shared_comment", "shared_view", "team_edit", "team_comment",
  "team_view", "space", "workspace", "readers_comment", "hard_lock",
]

describe("the words for doc access", () => {
  it("say every reason in a sentence, never a version or a claim of compliance", () => {
    for (const r of REASONS) {
      const text = accessReasonText(r)
      expect(text).toMatch(/^[A-Z][^A-Z]*\.$/)
      expect(text).not.toMatch(/complian|certified|v\d/i)
    }
    expect(accessReasonText("space", { space: "Launch" })).toBe("It's in Launch, which you're in.")
    for (const label of Object.values(ACCESS_LEVEL_LABEL)) expect(label).toMatch(/^[A-Z][a-z ]+$/)
  })

  it("lead with the strongest reason, and say when a hard lock holds someone below it", () => {
    expect(explainDocAccess({ level: "edit", reasons: ["shared_view", "team_edit"], locked: false })).toBe("A team you're in can edit it.")
    expect(explainDocAccess({ level: "comment", reasons: ["shared_edit", "hard_lock"], locked: true })).toBe(
      "It's shared with you to edit. It's locked, so you can comment but not edit.",
    )
    expect(explainDocAccess({ level: "none", reasons: [], locked: false })).toBe("")
  })
})
