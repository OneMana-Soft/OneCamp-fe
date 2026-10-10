import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The phone's top bar says where you are. Several titles were wrong or in
// title case: the list of teams said "Team", the goals list "Goal", and
// "My Calendar", "Event Detail", "My Profile", "Your Posts", "Create Task".

let pathname = "/app/team"
const dispatched: unknown[] = []
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => (a: unknown) => dispatched.push(a), useSelector: () => false }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1", user_is_admin: false } } }), useFetch: () => ({}) }))
vi.mock("@/components/ai/NudgeBell", () => ({ default: () => <button>Nudges</button> }))
vi.mock("@/components/navigationBar/userStatusNav", () => ({ UserStatusNav: () => <button>Set your status</button> }))
vi.mock("@/components/navigationBar/userAvatarNav", () => ({ UserAvatarNav: () => <span>SR</span> }))

import { MobileTopNavigationBarSecond } from "./mobileTopNavigationBarSecond"
import { MobileTopNavigationBarThird } from "./mobileTopNavigationBarThird"

afterEach(() => {
  cleanup()
  dispatched.length = 0
})

describe("the phone's top bar", () => {
  it.each([
    ["/app/team", "Teams"],
    ["/app/goals", "Goals"],
    ["/app/goals/g1", "Goal"],
    ["/app/calendar", "Calendar"],
    ["/app/calendar/event/e1", "Event"],
    ["/app/profile", "Your profile"],
    ["/app/posts", "Your posts"],
    ["/app/create/task", "New task"],
    ["/app/myTask", "My tasks"],
    // Settings sections by the names their pages give them.
    ["/app/settings/api-tokens", "API tokens"],
    ["/app/settings", "Settings"],
    ["/app/doc/d1/comments", "Comments"],
  ])("titles %s as %s", (path, title) => {
    pathname = path
    render(<MobileTopNavigationBarSecond />)
    expect(screen.getByText(title)).toBeTruthy()
  })

  it("opens the menu from the avatar by tap or keyboard, a 44px target", () => {
    pathname = "/app/home"
    render(<MobileTopNavigationBarThird />)
    const menu = screen.getByRole("button", { name: "Open menu" })
    expect(menu.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    fireEvent.click(menu)
    fireEvent.keyDown(menu, { key: "Enter" })
    expect(dispatched).toHaveLength(2)
  })
})
