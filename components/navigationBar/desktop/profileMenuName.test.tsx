import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const push = vi.fn()
const dispatched: unknown[] = []
vi.mock("@/components/navigationBar/userAvatarNav", () => ({ UserAvatarNav: () => <span>SR</span> }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam" } } }) }))
vi.mock("react-redux", () => ({ useDispatch: () => (a: unknown) => dispatched.push(a) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: vi.fn() }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/components/notifications/PauseNotificationsDialog", () => ({ PauseNotificationsDialog: () => null, pauseMenuLabel: () => "Pause notifications" }))

import DesktopNavigationUserProfile from "@/components/navigationBar/desktop/desktopNavigationUserProfile"

afterEach(() => {
  cleanup()
  push.mockClear()
  dispatched.length = 0
})

function openMenu() {
  render(<DesktopNavigationUserProfile />)
  const trigger = screen.getByRole("button", { name: "Profile and settings" })
  fireEvent.keyDown(trigger, { key: "Enter" })
  return screen.getByRole("menu")
}

describe("the profile menu", () => {
  // Its button was named by the initials inside it ("SR"): where the status,
  // the theme and sign-out live was announced as two letters.
  it("is a button named for what it opens", () => {
    render(<DesktopNavigationUserProfile />)
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy()
  })

  // Only Pause had an icon, with a margin on top of the item's own gap, so the
  // labels began at three places: 8px in, 40px in, and 32px in for the
  // Appearance choices. Every item now leads with its icon in the item's 16px
  // slot, whose gap puts the label where a choice's sits (pl-8).
  it("starts every label on one line", () => {
    const menu = openMenu()
    const items = [...menu.querySelectorAll("[role=menuitem]")]
    expect(items.length).toBeGreaterThanOrEqual(5)
    for (const item of items) {
      const icon = item.firstElementChild
      expect(icon?.tagName.toLowerCase(), item.textContent ?? "").toBe("svg")
      expect(icon?.getAttribute("class") ?? "").not.toMatch(/\bm[rl]-/)
    }
    const primitive = readFileSync(resolve(__dirname, "../../ui/dropdown-menu.tsx"), "utf8")
    // An item: 8px in, a 16px icon, an 8px gap. A choice: 32px in.
    expect(primitive).toMatch(/items-center gap-2 rounded-sm px-2 [^"]*\[&>svg\]:size-4/)
    expect(primitive).toMatch(/py-1\.5 pl-8 pr-2/)
  })

  // What it opened was "Your profile"; the settings page had no door here.
  it("opens your profile from Your profile, and the settings page from Settings", () => {
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Your profile" }))
    expect(dispatched).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ key: "selfUserProfile" }) }))
    cleanup()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }))
    expect(push).toHaveBeenCalledWith("/app/settings")
  })
})
