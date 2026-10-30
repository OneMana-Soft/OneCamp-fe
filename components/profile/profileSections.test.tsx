import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { firstScreen } from "../../scripts/fluidity/reach.mjs"

// fluid-14: Settings opens on Your profile, and its code came at the press:
// 156 KB of script, most of it the parts that save as they change (the theme
// and accent, the calendar connection, password, two-step and passkeys).
// Those are a chunk of their own now, which the shell warms once the first
// screen has settled, so the press fetches the details alone.

vi.mock("@/components/profile/ProfileSettingsSections", () => ({
  ProfileSections: () => (
    <>
      <div id="profile-appearance" />
      <div id="profile-calendar" />
      <div id="profile-security" />
    </>
  ),
}))

afterEach(cleanup)

describe("Your profile's sections", () => {
  it("are a chunk of their own: the profile page doesn't reach them", () => {
    // Its first screen: the page with its own folders' layouts and boundaries (V-49).
    const files = firstScreen(["app/app/settings/profile/page.tsx"])
    for (const f of ["components/profile/ProfileSettingsSections.tsx", "components/profile/PasskeySection.tsx", "components/profile/TwoFactorSection.tsx", "components/profile/ChangePasswordSection.tsx"]) {
      expect(files.has(f), f).toBe(false)
    }
  })

  it("bring the places a jump lands on with them", async () => {
    const { profileSections } = await import("./profileSections")
    expect(await profileSections.warm()).toBe(true)
    const { container } = render(<profileSections.Part />)
    expect([...container.querySelectorAll("[id]")].map((e) => e.id)).toEqual(["profile-appearance", "profile-calendar", "profile-security"])
  })
})
