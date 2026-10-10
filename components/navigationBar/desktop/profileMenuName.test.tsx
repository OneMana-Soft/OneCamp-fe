import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/navigationBar/userAvatarNav", () => ({ UserAvatarNav: () => <span>SR</span> }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam" } } }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: vi.fn() }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/components/notifications/PauseNotificationsDialog", () => ({ PauseNotificationsDialog: () => null, pauseMenuLabel: () => "Pause notifications" }))

import DesktopNavigationUserProfile from "@/components/navigationBar/desktop/desktopNavigationUserProfile"

afterEach(cleanup)

describe("the profile menu", () => {
  // Its button was named by the initials inside it ("SR"): where the status,
  // the theme and sign-out live was announced as two letters.
  it("is a button named for what it opens", () => {
    render(<DesktopNavigationUserProfile />)
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy()
  })
})
