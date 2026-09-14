import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { shouldShowChecklist } from "./SetupChecklist"
import type { OnboardingState } from "@/services/onboardingService"

/**
 * Each of these is a real admin on a real dashboard. The card appearing when it
 * should not is clutter on the most-visited screen in the product; the card
 * failing to appear is the empty-room problem it was built to fix.
 */

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
    dismissed: false,
    steps: [{ id: "channel", title: "t", detail: "d", href: "/app/channel", done: false }],
    done: 0,
    total: 1,
    complete: false,
    ...over,
})

describe("shouldShowChecklist", () => {
    it("shows an admin what is left", () => {
        expect(shouldShowChecklist(true, false, state())).toBe(true)
    })

    it("never shows a member", () => {
        // The endpoint is admin-only. A member rendering this would 403 on every
        // dashboard load for something they were never going to be shown.
        expect(shouldShowChecklist(false, false, state())).toBe(false)
        expect(shouldShowChecklist(undefined, false, state())).toBe(false)
    })

    it("stays hidden after it is dismissed, before and after the write lands", () => {
        // `hidden` is the optimistic local flag; `dismissed` is what the server
        // says on the next load. Both have to suppress it or the card flashes
        // back between the click and the reload.
        expect(shouldShowChecklist(true, true, state())).toBe(false)
        expect(shouldShowChecklist(true, false, state({ dismissed: true }))).toBe(false)
    })

    it("goes away on its own when the work is actually done", () => {
        // The point of deriving steps from the workspace: no one has to remember
        // to dismiss it.
        expect(shouldShowChecklist(true, false, state({ complete: true, done: 1 }))).toBe(false)
    })

    it("shows nothing when every step was filtered out for this edition", () => {
        // The AI-free build drops the model-provider step. A workspace where that
        // was the only remaining step must not render an empty card.
        expect(shouldShowChecklist(true, false, state({ steps: [], total: 0 }))).toBe(false)
    })

    it("shows nothing while the state has not loaded", () => {
        // A dashboard must not reserve space for a card that may never appear.
        expect(shouldShowChecklist(true, false, null)).toBe(false)
    })
})

// The Home page contradicted itself on a first visit: "No recent activity yet"
// sat directly under a briefing describing the morning's activity. The list is
// what YOU opened, not what happened, and the two words for those must not be
// the same word.
describe("the Recent card's empty state", () => {
  const dashboard = readFileSync(
    join(__dirname, "desktop", "desktopDashboard.tsx"),
    "utf8",
  )

  it("does not call your own history 'activity'", () => {
    const rendered = dashboard.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    expect(rendered).not.toContain("No recent activity")
  })

  it("says what will fill it", () => {
    expect(dashboard).toContain("appear here")
  })
})
