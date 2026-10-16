import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// QA SH-11 (14 Oct 2026): every settings page's tab said "Settings · OneCamp",
// and admin pages and the 404 just "OneCamp".

const nav = vi.hoisted(() => ({ pathname: "/app/admin", search: "tab=users" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("react-redux", () => ({ useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: {} } }) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

const { DocumentTitle } = await import("./DocumentTitle")
const { AppNotFound } = await import("@/components/error/AppNotFound")

beforeEach(() => {
  nav.pathname = "/app/admin"
  nav.search = "tab=users"
  document.title = ""
})
afterEach(cleanup)

describe("the tab's title", () => {
  it("names the admin section its ?tab= opens", () => {
    render(<DocumentTitle />)
    expect(document.title).toBe("Members · Settings · OneCamp")
  })

  it("says Page not found while the 404 shows, and lets go after it", () => {
    nav.pathname = "/app/q4-launch-plan"
    nav.search = ""
    const { rerender } = render(
      <>
        <DocumentTitle />
        <AppNotFound />
      </>,
    )
    expect(document.title).toBe("Page not found · OneCamp")
    act(() => rerender(<DocumentTitle />))
    expect(document.title).toBe("OneCamp")
  })
})
