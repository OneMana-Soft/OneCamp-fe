import { describe, expect, it } from "vitest"
import { PERMISSIONS_POLICY } from "./permissionsPolicy"

// Features the product uses: passkeys (sign in and add), calls (camera,
// microphone, screen sharing). Turning one off breaks it silently, which is
// how passkey sign-in did nothing at all for its first release.
describe("Permissions-Policy", () => {
  const policy = Object.fromEntries(PERMISSIONS_POLICY.split(", ").map((d) => d.split("=")))
  it.each(["publickey-credentials-get", "publickey-credentials-create", "camera", "microphone", "display-capture"])("keeps %s open to the site", (f) => {
    expect(policy[f]).toBe("(self)")
  })
})
