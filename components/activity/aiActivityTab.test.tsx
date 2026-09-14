import { describe, expect, it, afterEach, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

let aiOn = true
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => aiOn,
  useFeature: () => aiOn,
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: [] }, isLoading: false }) }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/activity",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/services/unreadCache", () => ({ clearActivityUnread: () => {} }))
vi.mock("@/components/activity/activityListTabContent", () => ({
  ActivityListTabContent: () => <div>other activity</div>,
}))

import { ActivityListTabs } from "@/components/activity/activityListTabs"

afterEach(() => {
  cleanup()
  aiOn = true
})

describe("the AI filter in Activity", () => {
  // The critique asked for governance in "lived chrome (badge / Activity filter)"
  // and, separately, found the sidebar to be a hotel lobby of equal doors. A tab
  // answers the first without worsening the second.
  it("is a tab in Activity rather than another item in the sidebar", () => {
    render(<ActivityListTabs />)
    expect(screen.getByText("AI")).toBeTruthy()
    // The existing filters are untouched.
    for (const t of ["Priority", "All", "Mentions", "Comments", "Reactions"]) {
      expect(screen.getByText(t), `${t} tab disappeared`).toBeTruthy()
    }
  })

  // On the AI-free edition an "AI" tab leading nowhere would advertise a
  // subsystem this server deliberately does not have.
  it("is absent when the server has no AI", () => {
    aiOn = false
    render(<ActivityListTabs />)
    expect(screen.queryByText("AI")).toBeNull()
    expect(screen.getByText("Priority")).toBeTruthy()
  })

  it("comes last, so it does not displace what people open Activity for", () => {
    const { container } = render(<ActivityListTabs />)
    const labels = Array.from(container.querySelectorAll("button, [role='tab']"))
      .map((n) => (n.textContent || "").trim())
      .filter((t) => ["Priority", "All", "Mentions", "Comments", "Reactions", "AI"].includes(t))
    expect(labels[labels.length - 1]).toBe("AI")
  })
})
