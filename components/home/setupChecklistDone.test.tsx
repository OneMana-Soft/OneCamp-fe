import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OnboardingState, OnboardingStep } from "@/services/onboardingService"

// The checklist's progress, as a ring, and the one moment worth a celebration:
// the last step done while this browser was following along. A workspace that
// was finished long ago gets no fanfare on every reload.

const svc = vi.hoisted(() => ({
  getOnboardingStatus: vi.fn<() => Promise<OnboardingState | undefined>>(),
  dismissOnboarding: vi.fn<() => Promise<void>>(),
  setStepSkipped: vi.fn<(id: string, skipped: boolean) => Promise<void>>(),
}))
vi.mock("@/services/onboardingService", () => svc)
const fx = vi.hoisted(() => ({ celebrate: vi.fn(() => 8) }))
vi.mock("@/lib/celebrate", () => ({ celebrate: fx.celebrate, springPop: vi.fn(), prefersReducedMotion: () => false }))

import SetupChecklist, { CHECKLIST_MEMO_KEY } from "./SetupChecklist"

const step = (id: string, over: Partial<OnboardingStep> = {}): OnboardingStep => ({
  id,
  title: `Step ${id}`,
  detail: `What ${id} does`,
  href: `/app/${id}`,
  done: false,
  ...over,
})
const status = (steps: OnboardingStep[], over: Partial<OnboardingState> = {}): OnboardingState => {
  const open = steps.filter((s) => !s.done && !s.skipped).length
  const done = steps.filter((s) => s.done).length
  return { dismissed: false, steps, done, total: open + done, complete: open === 0, skipped: steps.filter((s) => s.skipped).length, ...over }
}
async function show() {
  await act(async () => {
    render(<SetupChecklist isAdmin />)
  })
}

beforeEach(() => {
  localStorage.clear()
  fx.celebrate.mockClear()
  svc.getOnboardingStatus.mockReset()
  svc.dismissOnboarding.mockReset().mockResolvedValue()
  svc.setStepSkipped.mockReset().mockResolvedValue()
})
afterEach(cleanup)

describe("the checklist's progress", () => {
  it("is a ring that says how many steps are done", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("admin", { done: true }), step("invite"), step("model"), step("drill")]))
    await show()
    const ring = screen.getByRole("progressbar", { name: "1 of 4 steps done" })
    expect(ring.getAttribute("aria-valuenow")).toBe("25")
    expect(fx.celebrate).not.toHaveBeenCalled()
  })
})

describe("finishing the checklist", () => {
  it("celebrates once when the last step was done since this browser last showed the card", async () => {
    localStorage.setItem(CHECKLIST_MEMO_KEY, "open")
    svc.getOnboardingStatus.mockResolvedValue(status([step("admin", { done: true }), step("invite", { done: true })]))
    await show()
    expect(screen.getByRole("heading", { name: "Your workspace is set up" })).toBeInTheDocument()
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
    // The moment is over: the next visit shows nothing.
    expect(localStorage.getItem(CHECKLIST_MEMO_KEY)).toBe("closed")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("heading", { name: "Your workspace is set up" })).toBeNull()
  })

  it("says nothing and doesn't celebrate when a finished workspace loads again", async () => {
    localStorage.setItem(CHECKLIST_MEMO_KEY, "closed")
    svc.getOnboardingStatus.mockResolvedValue(status([step("admin", { done: true }), step("invite", { done: true })]))
    await show()
    expect(screen.queryByRole("heading", { name: "Your workspace is set up" })).toBeNull()
    expect(fx.celebrate).not.toHaveBeenCalled()
  })

  it("celebrates when setting the last open step aside finishes it in place", async () => {
    svc.getOnboardingStatus
      .mockResolvedValueOnce(status([step("admin", { done: true }), step("import", { skippable: true })]))
      .mockResolvedValueOnce(status([step("admin", { done: true }), step("import", { skippable: true, skipped: true })]))
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nothing to import" })))
    expect(screen.getByRole("heading", { name: "Your workspace is set up" })).toBeInTheDocument()
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
  })
})
