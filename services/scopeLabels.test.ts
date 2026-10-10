import { describe, expect, it } from "vitest"
import { scopeLabel } from "@/services/apiTokenService"

// What a token or an agent may do, in plain words: the labels read
// "Create / update tasks" and "Search workspace & apps".
describe("scope labels", () => {
  it("are plain words, with no slashes or ampersands", () => {
    for (const s of ["tasks:read", "tasks:write", "messages:read", "search:read", "docs:write"]) {
      expect(scopeLabel(s)).not.toMatch(/[/&]/)
    }
    expect(scopeLabel("tasks:write")).toBe("Create and update tasks")
  })

})
