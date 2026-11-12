import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { whenOnScreen } from "@/lib/ui/whenOnScreen"

// A seen mark says a person looked. Nobody looks at a hidden tab, so a mark
// waits for the page to come into view: the DMs did this on their own, and the
// Inbox didn't, so a live item into an Inbox left open in a background tab was
// marked seen and its badge cleared unseen. One helper for both.

let state: DocumentVisibilityState = "visible"
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
const show = (next: DocumentVisibilityState) => {
  state = next
  document.dispatchEvent(new Event("visibilitychange"))
}

afterEach(() => {
  state = "visible"
})

describe("whenOnScreen", () => {
  it("runs at once on a page on screen", () => {
    const run = vi.fn()
    whenOnScreen(run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("waits while the page is hidden, then runs once when it comes into view", () => {
    state = "hidden"
    const run = vi.fn()
    whenOnScreen(run)
    expect(run).not.toHaveBeenCalled()
    show("hidden")
    expect(run).not.toHaveBeenCalled()
    show("visible")
    show("hidden")
    show("visible")
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("runs nothing once cancelled", () => {
    state = "hidden"
    const run = vi.fn()
    const cancel = whenOnScreen(run)
    cancel()
    show("visible")
    expect(run).not.toHaveBeenCalled()
  })

  it("is how the DMs and the Inbox mark what's seen", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8")
    expect(read("hooks/useChatReceipts.ts")).toMatch(/whenOnScreen\(/)
    expect(read("hooks/useChatReceipts.ts")).not.toMatch(/visibilityState|visibilitychange/)
    expect(read("components/activity/activityListTabs.tsx")).toMatch(/whenOnScreen\(/)
  })
})
