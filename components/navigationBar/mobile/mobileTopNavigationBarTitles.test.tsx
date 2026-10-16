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
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/components/navigationBar/mobile/phoneSelfAvatar", () => ({ PhoneSelfAvatar: () => <span>SR</span> }))

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
    // Its name everywhere else, not "Assistant".
    ["/app/ai", "OneCamp AI"],
    // Settings sections by the names their pages give them.
    ["/app/settings/agents", "Agents and skills"],
    ["/app/settings/assistants", "Your AI assistants"],
    ["/app/settings/api-tokens", "API tokens"],
    ["/app/settings", "Settings"],
    ["/app/doc/d1/comments", "Comments"],
  ])("titles %s as %s", (path, title) => {
    pathname = path
    render(<MobileTopNavigationBarSecond />)
    expect(screen.getByText(title)).toBeTruthy()
  })

  // QA DSA-23 (14 Oct 2026): a doc's comments page said "Comments" alone.
  it("names the doc on its comments page, once its name is known", async () => {
    const { MobileTopNavigationBarSecondDoc } = await import("./mobileTopNavigationBarSecondDoc")
    const fetch = await import("@/hooks/useFetch")
    const spy = vi.spyOn(fetch, "useFetch").mockReturnValue({ data: { data: { doc_title: "Q4 launch plan" } } } as never)
    try {
      render(<MobileTopNavigationBarSecondDoc docId="d1" page="Comments" />)
      expect(screen.getByText("Comments · Q4 launch plan")).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
  })

  it("opens the menu from the avatar by tap or keyboard, a 44px target", () => {
    pathname = "/app/home"
    render(<MobileTopNavigationBarThird />)
    const menu = screen.getByRole("button", { name: "Your profile" })
    expect(menu.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    // A real button: Enter and Space press it natively.
    expect(menu.tagName).toBe("BUTTON")
    fireEvent.click(menu)
    expect(dispatched).toHaveLength(1)
  })
})
