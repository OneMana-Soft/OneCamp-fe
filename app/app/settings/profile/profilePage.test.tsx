import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Your profile as a page (design v3, admin D1, mock M7b). The identity band is
// the one playful moment in settings, so it is drawn in the person's OWN hue
// (the hue of their avatar, from lib/campHue), never the accent; the theme
// is three cards that re-theme as they are picked; passkeys are rows; and the
// sections keep the ids Search settings lands on (lib/adminSections).

const { setTheme, setAccent } = vi.hoisted(() => ({ setTheme: vi.fn(), setAccent: vi.fn() }))
const profile = {
  user_uuid: "u1",
  user_name: "Sam Rivera",
  user_full_name: "Sam Rivera",
  user_handle: "sam-rivera",
  user_email_id: "visitor@demo.onemana.dev",
  user_profile_object_key: "",
  user_app_lang: "en",
  user_status: "online",
}
const fetched = { data: { data: profile }, mutate: vi.fn(), isError: undefined }
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => fetched, useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ upload_limit_bytes: 10_000_000, upload_limit_mb: 10 }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useStatusIsExpired", () => ({ useStatusIsExpired: () => false }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/lib/utils/i18n", () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme }) }))
vi.mock("@/components/activeTheme/activeTheme", () => ({
  VALID_COLOR_THEMES: ["onecamp", "blue", "green"],
  useThemeConfig: () => ({ activeTheme: "onecamp", setActiveTheme: setAccent }),
}))
vi.mock("@/components/dialog/appLanguageCombobox", () => ({ AppLanguageCombobox: () => null }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: vi.fn(async (url: string) => (url === "/auth/has-password" ? { data: { has_password: true } } : { data: { data: { isConnected: false, taskSyncEnabled: false } } })),
    post: vi.fn(async () => ({})),
  },
}))
vi.mock("@/services/twoFactorService", () => ({
  default: { getStatus: async () => ({ ok: true, data: { enrolled: true, pendingEnrolment: false, unusedRecoveryCodes: 8 } }) },
}))
vi.mock("@/services/passkeyService", () => ({
  listPasskeys: async () => [
    { id: "k1", name: "Passkey on Mac", created_at: "2026-10-03T10:00:00Z", last_used_at: "2026-10-10T10:00:00Z" },
    { id: "k2", name: "Passkey on iPhone or iPad", created_at: "2026-10-04T10:00:00Z", last_used_at: null },
  ],
  addPasskey: vi.fn(),
  removePasskey: vi.fn(),
  renamePasskey: vi.fn(),
}))
vi.mock("@/lib/auth/webauthn", () => ({ passkeysSupported: () => true, passkeyErrorMessage: () => null }))

import ProfileSettingsPage from "./page"
import { hueFor } from "@/lib/campHue"

afterEach(cleanup)

const renderPage = async () => {
  // Its sections are a chunk of their own, which the shell warms once the
  // first screen has settled (components/profile/profileSections, fluid-14).
  const { warmProfileSections } = await import("@/components/profile/profileSections")
  await warmProfileSections()
  await act(async () => void render(<ProfileSettingsPage />))
}

describe("the profile page", () => {
  it("draws the identity band in the person's own hue, with their name, handle and address", async () => {
    await renderPage()
    const band = document.querySelector<HTMLElement>("[data-identity-band]")!
    const hue = hueFor("Sam Rivera")
    expect(band.dataset.hue).toBe(hue)
    expect(band.className).toContain(`hue-${hue}`)
    expect(within(band).getByText("Sam Rivera")).toBeInTheDocument()
    expect(within(band).getByText("@sam-rivera · visitor@demo.onemana.dev")).toBeInTheDocument()
    // The avatar's initials are the same hue, so the glow and the face agree.
    expect(within(band).getByText("SR").className).toContain(`hue-${hue}`)
    expect(within(band).getByRole("button", { name: "Set a status" })).toBeInTheDocument()
  })

  it("changes the theme from its cards, and the accent from its swatches", async () => {
    await renderPage()
    const themes = screen.getByRole("radiogroup", { name: "Theme" })
    fireEvent.click(within(themes).getByRole("radio", { name: "Dark" }))
    expect(setTheme).toHaveBeenCalledWith("dark")
    const accents = screen.getByRole("radiogroup", { name: "Accent colour" })
    expect(within(accents).getByRole("radio", { name: "OneCamp" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(within(accents).getByRole("radio", { name: "Blue" }))
    expect(setAccent).toHaveBeenCalledWith("blue")
  })

  it("lists passkeys as rows with where they live, when they were added and used, and Remove", async () => {
    await renderPage()
    const list = await screen.findByRole("list", { name: "Your passkeys" })
    const rows = within(list).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(/Added .* · last used/)
    expect(rows[1]).toHaveTextContent("not used yet")
    expect(within(rows[0]).getByRole("button", { name: "Remove Passkey on Mac" })).toBeInTheDocument()
  })

  it("says two-step verification is on with the authenticator app", async () => {
    await renderPage()
    expect(await screen.findByText("On · authenticator app")).toBeInTheDocument()
  })

  it("keeps the ids Search settings lands on", async () => {
    await renderPage()
    for (const id of ["profile-appearance", "profile-calendar", "profile-security"]) {
      expect(document.getElementById(id), id).not.toBeNull()
    }
  })
})
