import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The drill plays as a sequence (design v3, admin §A15b): the ask, the check
// against the access of the person behind the agent, and the Refused row with
// a danger shield, 400ms apart; then "Recorded in the audit log". The refusal
// quoted is the server's own. Under reduced motion the rows appear together.

import { DRILL_STAGGER_MS, DrillSequence } from "@/components/admin/GovernanceDrillCard"

const result = {
  passed: true,
  steps: [],
  refusal_reason: "You are not a member of #drill-finance.",
  chain_ok: true,
  chain_checked: 500,
  chain_partial: true,
  ran_at: "2026-10-11T10:00:00Z",
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never
}

const rows = (c: HTMLElement) => [...c.querySelectorAll("[data-drill-row]")].map((r) => (r as HTMLElement).dataset.drillRow)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the governance drill's sequence", () => {
  it("plays the ask, the check and the refusal 400ms apart, then where it is recorded", async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    const { container } = render(<DrillSequence result={result} forbidden="drill-finance" />)
    expect(rows(container)).toEqual([])
    await act(async () => {
      vi.advanceTimersByTime(DRILL_STAGGER_MS)
    })
    expect(rows(container)).toEqual(["ask"])
    expect(container.textContent).toContain("#drill-finance")
    await act(async () => {
      vi.advanceTimersByTime(DRILL_STAGGER_MS)
    })
    expect(rows(container)).toEqual(["ask", "check"])
    expect(container.querySelector("[data-drill-recorded]")).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(DRILL_STAGGER_MS)
    })
    expect(rows(container)).toEqual(["ask", "check", "verdict"])
    const verdict = container.querySelector("[data-drill-row='verdict']") as HTMLElement
    expect(verdict.dataset.tone).toBe("refused")
    expect(verdict.textContent).toContain("Refused")
    // The permission layer's own words, not a paraphrase.
    expect(verdict.textContent).toContain("You are not a member of #drill-finance.")
    expect(screen.getByRole("link", { name: "Recorded in the audit log →" }).getAttribute("href")).toBe("/app/admin?tab=audit#audit-log")
    expect(DRILL_STAGGER_MS).toBe(400)
  })

  it("shows the three rows together under reduced motion", () => {
    setReducedMotion(true)
    const { container } = render(<DrillSequence result={result} forbidden="drill-finance" />)
    expect(rows(container)).toEqual(["ask", "check", "verdict"])
  })

  it("says an incident, not a refusal, when the post went through", () => {
    setReducedMotion(true)
    const { container } = render(<DrillSequence result={{ ...result, passed: false, refusal_reason: undefined }} forbidden="drill-finance" />)
    const verdict = container.querySelector("[data-drill-row='verdict']") as HTMLElement
    expect(verdict.dataset.tone).toBe("incident")
    expect(verdict.textContent).toMatch(/incident/)
  })
})
