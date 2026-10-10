import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Files every edition carries import only what every edition has. The public
 * repo's edition without AI has no lib/utils/userDisplayName and no
 * lib/utils/composerPlaceholder (the composers' check is in
 * composerPlaceholders.test.ts), and a new file in a folder the public repo
 * lacks is left behind when the web app is ported there. Each case below
 * would have broken that build.
 */
const ROOT = join(__dirname, "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("files every edition carries", () => {
  it.each(["components/dialog/otherUserProfileDialog.tsx", "components/profile/mobileOtherUserProfile.tsx"])(
    "%s names a person by lib/personName, not the AI edition's helper",
    (file) => {
      const src = read(file)
      expect(src).toMatch(/displayNameOf\(/)
      expect(src).not.toMatch(/@\/lib\/utils\/userDisplayName/)
    },
  )

  it.each([
    "components/dialog/editProfileDailog.tsx",
    "components/profile/ProfileSettingsSections.tsx",
    "components/profile/mobileSelfProfile.tsx",
    "components/notifications/NotificationPreferencesCard.tsx",
    "components/notifications/ReadReceiptsCard.tsx",
  ])("%s takes the settings parts from components/ui, a folder every edition has", (file) => {
    const src = read(file)
    expect(src).toMatch(/from "@\/components\/ui\/settingsSection"/)
    expect(src).not.toMatch(/@\/components\/settings\//)
  })

  it("keeps no components/settings folder, which the public repo does not have", () => {
    expect(existsSync(join(ROOT, "components/settings"))).toBe(false)
  })
})
