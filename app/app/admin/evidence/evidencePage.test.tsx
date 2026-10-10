import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The evidence pack opens full-window from the audit log, and it had no way
// back: an admin reached Admin again only through the browser's Back or the
// sidebar. Every state now has the bar with the way back to the audit log.

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
const plan = vi.hoisted(() => ({ locked: false }))
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ freePlan: plan.locked, isLocked: () => plan.locked, upgradeUrl: undefined }),
}))
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getEvidencePack: (...a: unknown[]) => api.get(...a),
  downloadEvidencePack: vi.fn(),
}))
vi.mock("@/components/admin/EvidencePackView", () => ({ default: () => <article>the pack</article> }))

const { default: EvidencePackPage } = await import("./page")
const AUDIT_LOG_HREF = "/app/admin?tab=audit"

afterEach(() => {
  cleanup()
  plan.locked = false
  api.get.mockReset()
})

const wayBack = () => screen.getByRole("link", { name: "Audit log" })

describe("the evidence pack page", () => {
  it("has a way back to the audit log while it reads the pack", async () => {
    api.get.mockResolvedValue({ pack: {} })
    render(<EvidencePackPage />)
    expect(await screen.findByText("the pack")).toBeTruthy()
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
  })

  it("has the way back on the free plan, beside the reason it's locked", () => {
    plan.locked = true
    api.get.mockResolvedValue(null)
    render(<EvidencePackPage />)
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
    expect(screen.getByText(/needs a OneCamp licence/)).toBeTruthy()
  })

  it("has the way back when the pack couldn't be read, beside Try again", async () => {
    api.get.mockRejectedValue(new Error("503"))
    await act(async () => void render(<EvidencePackPage />))
    expect(await screen.findByText("Couldn't load the evidence pack")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
  })
})
