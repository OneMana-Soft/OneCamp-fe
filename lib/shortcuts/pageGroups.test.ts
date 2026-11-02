import { describe, expect, it, vi } from "vitest"
import { pageGroups, showPageKeys, subscribePageGroups } from "@/lib/shortcuts/pageGroups"

const group = (title: string) => ({ title, rows: [{ keys: "Ctrl/⌘ + J", does: `Something on ${title}` }] })

// INTEGRATOR-76's wR34 FAIL (tableKeys :46): a table's keys come in their own lazy chunk, after a list
// opened early had read the groups once. The groups now say when they change, so an open list follows.
describe("a page's keys groups", () => {
  it("tell each subscriber when a group comes or goes, once each, through a list that changes only then", () => {
    const heard = vi.fn()
    const stop = subscribePageGroups(heard)
    const before = pageGroups()
    // Read twice with nothing between: the same list (useSyncExternalStore's snapshot must hold still).
    expect(pageGroups()).toBe(before)
    const hideTables = showPageKeys(group("Tables"))
    expect(heard).toHaveBeenCalledTimes(1)
    expect(pageGroups()).not.toBe(before)
    expect(pageGroups().map((g) => g.title)).toEqual(["Tables"])
    const hideCall = showPageKeys(group("This call"))
    // In the order they came.
    expect(pageGroups().map((g) => g.title)).toEqual(["Tables", "This call"])
    expect(heard).toHaveBeenCalledTimes(2)
    hideTables()
    // A second hide changes nothing, and says nothing.
    hideTables()
    expect(heard).toHaveBeenCalledTimes(3)
    expect(pageGroups().map((g) => g.title)).toEqual(["This call"])
    stop()
    hideCall()
    expect(heard).toHaveBeenCalledTimes(3)
    expect(pageGroups()).toEqual([])
  })
})
