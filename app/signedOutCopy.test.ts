import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The words the signed-out pages say when something fails. "Something went
// wrong. Please try again." said nothing about what went wrong; "Network
// error" and "Directory server unreachable" were the browser's words. Each
// failure now says what didn't happen, from the reader's side.

const FILES = [
  "app/page.tsx",
  "app/signup/page.tsx",
  "app/forgot-password/page.tsx",
  "app/reset-password/page.tsx",
  "app/admin-setup/page.tsx",
  "services/auth/AuthService.ts",
]
// Code, not the comments explaining what the words used to be.
const read = (f: string) =>
  readFileSync(join(process.cwd(), f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")

describe("the signed-out pages' failure words", () => {
  it("never say 'something went wrong, please try again', or the browser's words", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/Something went wrong\. Please try again\./)
      expect(read(f), f).not.toMatch(/Network error|Directory server unreachable|Failed to reach directory server/)
    }
  })

  it("write 'sign-up' with its hyphen on the demo button", () => {
    const page = read("app/page.tsx")
    expect(page).toContain("Try the demo, no sign-up needed")
    expect(page).not.toMatch(/no sign up needed/)
  })
})
