import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
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

/**
 * The playful layer's graphics (identity marks, tiles, motifs, spot
 * illustrations) and the helpers they rest on are drawn by both editions and
 * by the demo build alike, so they import nothing that only one of them has:
 * nothing from the AI edition, and nothing demo-only.
 */
describe("the playful layer is edition-neutral", () => {
  const FORBIDDEN = [
    /@\/components\/ai\b/,
    /@\/lib\/ai\b/,
    /demo(Funnel|Destination|Splash|Guide|Wins)|Demo(Guide|LeadPrompt|Wins|SharedNote)/,
  ]
  const files = [
    ...readdirSync(join(ROOT, "components/ui/graphics"), { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => `components/ui/graphics/${f}`),
    "lib/campHue.ts",
    "lib/utils/getAvatarColor.ts",
  ]

  it("found the graphics to check", () => {
    expect(files).toContain("components/ui/graphics/IdentityMark.tsx")
  })

  it.each(files)("%s imports nothing AI or demo-only", (file) => {
    const imports = [...read(file).matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2])
    const bad = imports.filter((spec) => FORBIDDEN.some((re) => re.test(spec)))
    expect(bad, `${file} imports ${bad.join(", ")}`).toEqual([])
  })
})
