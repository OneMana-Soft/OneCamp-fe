import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The free plan filling up, said to an admin before an invitation is refused
// (SHELL-15): once at 80 % and once when full, each dismissed for good, with
// the way past the limit. Never to a member, never on a licence.

const plan = vi.hoisted(() => ({ now: {} as Record<string, unknown>, asked: [] as unknown[] }))
vi.mock("@/hooks/usePlan", () => ({
  usePlan: (opts?: unknown) => {
    plan.asked.push(opts)
    return plan.now
  },
}))

vi.mock("@/components/banner/EmailOffBanner", () => ({ EmailOffBanner: () => null }))
vi.mock("@/components/banner/DiskBanner", () => ({ DiskBanner: () => null }))
vi.mock("@/components/banner/ImportOutcomeBanner", () => ({ ImportOutcomeBanner: () => null }))
vi.mock("@/components/banner/MembersEditNotice", () => ({ MembersEditNotice: () => null }))

import { SeatsNotice } from "@/components/banner/SeatsNotice"
import { AdminBanners } from "@/components/banner/AdminBanners"

const seats = (used: number, limit = 25) => ({ known: true, failed: false, plan: limit ? "free" : "licensed", used, limit, freePlan: limit > 0, upgradeUrl: "https://onemana.dev/buy" })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  plan.asked.length = 0
})

describe("the seats notice", () => {
  it("tells an admin once at 80 % and again when full", () => {
    plan.now = seats(10)
    const { rerender } = render(<SeatsNotice />)
    expect(screen.queryByRole("status")).toBeNull()

    plan.now = seats(20)
    rerender(<SeatsNotice />)
    const notice = screen.getByRole("status")
    expect(notice.textContent).toContain("5 places left on the free plan.")
    const way = screen.getByRole("link", { name: "Remove the 25-person limit" })
    expect(way.getAttribute("href")).toBe("https://onemana.dev/buy")
    expect(way.getAttribute("target")).toBe("_blank")
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByRole("status")).toBeNull()

    // Dismissed for this threshold: not again at 80 %, after a reload too.
    plan.now = seats(21)
    cleanup()
    render(<SeatsNotice />)
    expect(screen.queryByRole("status")).toBeNull()

    // Full: said again.
    plan.now = seats(25)
    cleanup()
    render(<SeatsNotice />)
    expect(screen.getByRole("status").textContent).toContain("No places left on the free plan.")
  })

  it("says nothing on a licence, or before the plan is known", () => {
    plan.now = seats(400, 0)
    render(<SeatsNotice />)
    expect(screen.queryByRole("status")).toBeNull()
    cleanup()
    plan.now = { known: false, failed: false, used: 0, limit: 0 }
    render(<SeatsNotice />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("is an admin's: a member's banners ask nothing about the plan", async () => {
    plan.now = seats(24)
    render(<AdminBanners isAdmin={false} />)
    expect(screen.queryByText(/places? left on the free plan/)).toBeNull()
    expect(plan.asked).toEqual([])
    cleanup()
    render(<AdminBanners isAdmin />)
    expect(await screen.findByText("1 place left on the free plan.")).toBeTruthy()
  })
})
