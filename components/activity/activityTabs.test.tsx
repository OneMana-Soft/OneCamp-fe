import { describe, expect, it, afterEach, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: [] }, isLoading: false }) }))
let search = ""
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/activity",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/components/activity/activityListTabContent", () => ({
  ActivityListTabContent: () => <div>activity</div>,
}))

import { ActivityListTabs } from "@/components/activity/activityListTabs"

afterEach(() => {
  cleanup()
  search = ""
})

// Comments and Reactions were folded into All: a few tabs, not five.
describe("Activity tabs", () => {
  it("are Priority, All and Mentions", () => {
    render(<ActivityListTabs />)
    for (const t of ["Priority", "All", "Mentions"]) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.queryByText("Comments")).toBeNull()
    expect(screen.queryByText("Reactions")).toBeNull()
  })

  it("open All for an old link to a tab that was folded in", () => {
    search = "tab=reactions"
    render(<ActivityListTabs />)
    expect(screen.getByText("All").closest("[role='tab']")?.getAttribute("data-state")).toBe("active")
  })
})
