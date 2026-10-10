import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// One answer, as SWR gives: a new object each render would be a new answer
// each render to the list's effect.
const { answer } = vi.hoisted(() => ({ answer: { data: { data: { activities: [], has_more: false } }, isLoading: false, isError: false, mutate: () => {} } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer }))
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/app/activity", useSearchParams: () => new URLSearchParams() }))

import { ActivityAllListResult } from "@/components/activity/activityAllListResult"

afterEach(cleanup)

describe("an empty Activity", () => {
  it("says you're all caught up under a small check", () => {
    const { container } = render(<ActivityAllListResult priorityOnly onViewAll={() => {}} />)
    expect(screen.getByText("You're all caught up")).toBeTruthy()
    expect(container.querySelector("svg")).toBeTruthy()
    // The one action is kept.
    expect(screen.getByRole("button", { name: "View all activity" })).toBeTruthy()
  })
})
