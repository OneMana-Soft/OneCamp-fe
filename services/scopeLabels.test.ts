import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
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

  it("give each permission on the agent's consent page a phone-sized row", () => {
    // Design v3 (admin F9): 36px scope rows, 44px on a phone, from auth.css.
    expect(readFileSync("components/connect/ConnectAuthorize.tsx", "utf8")).toMatch(/<label key=\{s\} className="auth-scope"/)
    const css = readFileSync("app/styles/admin/auth.css", "utf8")
    expect(css).toMatch(/\.auth-scope \{ min-height: 44px; \}/)
  })
})
