import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// QA SH-06 (14 Oct 2026): on a wide screen /app/user/<id> went home and
// floated the profile card over Home, with no title, and once left a blank
// sheet behind it. The route is the profile page everywhere now.

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), useParams: () => ({ "user-id": "u-maya" }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))

import UserProfileLayout from "./layout"

afterEach(cleanup)

describe("a link to someone on a wide screen", () => {
  it("shows their profile page, never Home with a card over it", () => {
    render(
      <UserProfileLayout>
        <p>Maya&apos;s profile</p>
      </UserProfileLayout>,
    )
    expect(screen.getByText("Maya's profile")).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
