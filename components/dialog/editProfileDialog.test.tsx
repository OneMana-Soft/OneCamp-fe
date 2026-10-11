import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// "Your profile" is a page of the settings shell on a computer (design v3,
// admin D1). Every Profile entry point opens this dialog through
// openUI("selfUserProfile"), so on a computer the dialog goes to the page and
// closes itself, and none of them has to change. On a phone it stays a dialog,
// built from the page's own parts.

const { media, push } = vi.hoisted(() => ({ media: { isDesktop: true }, push: vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: !media.isDesktop, isTablet: false, isDesktop: media.isDesktop }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/profile/ProfileIdentityBand", () => ({ ProfileIdentityBand: () => <div data-testid="band" /> }))
vi.mock("@/components/profile/ProfileFieldsCard", () => ({
  ProfileFieldsCard: () => <div data-testid="fields" />,
  AppearOnlineCard: () => <div data-testid="online" />,
}))
vi.mock("@/components/profile/ProfileSettingsSections", () => ({
  AppearanceSection: () => <div data-testid="appearance" />,
  CalendarSection: () => null,
  SigningInSection: () => null,
}))

import EditProfileDialog from "./editProfileDailog"

afterEach(() => {
  cleanup()
  push.mockReset()
})

describe("opening your profile", () => {
  it("goes to the profile page on a computer and closes itself", () => {
    media.isDesktop = true
    const setOpenState = vi.fn()
    render(<EditProfileDialog dialogOpenState setOpenState={setOpenState} />)
    expect(push).toHaveBeenCalledWith("/app/settings/profile")
    expect(setOpenState).toHaveBeenCalledWith(false)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("stays a dialog on a phone, made of the page's own parts", () => {
    media.isDesktop = false
    render(<EditProfileDialog dialogOpenState setOpenState={vi.fn()} />)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    for (const id of ["band", "fields", "online", "appearance"]) expect(screen.getByTestId(id)).toBeInTheDocument()
  })
})
