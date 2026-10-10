import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { SaveBar } from "@/components/ui/settingsSection"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const bar = (dirty = true) =>
  render(<SaveBar dirty={dirty} saving={false} onSave={() => {}} onDiscard={() => {}} what="email changes" />)

describe("the bar for unsaved changes", () => {
  it("rides a rem above the phone's bottom navigation, and 1rem from the bottom from md up", () => {
    bar()
    const region = screen.getByRole("region", { name: "Unsaved changes" })
    // On a phone the scroll area already keeps 4rem (plus the home indicator's
    // inset) free for the 3.5rem navigation, and a sticky offset counts from
    // inside it: 0.5rem more is 4.5rem from the edge. An offset that added the
    // navigation's height again floated the bar 79px over it at 390px.
    expect(region.className).toContain("sticky")
    expect(region.className).toMatch(/(^|\s)bottom-2(\s|$)/)
    expect(region.className).toContain("md:bottom-4")
    expect(region.className).not.toMatch(/bottom-\[calc/)
    const layout = readFileSync(join(__dirname, "..", "navigationBar", "mobile", "mobileNavigationBar.tsx"), "utf8")
    expect(layout).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]")
  })

  it("asks before the tab closes with changes unsaved, in every browser's way", () => {
    const add = vi.spyOn(window, "addEventListener")
    bar()
    const warn = add.mock.calls.find(([type]) => type === "beforeunload")?.[1] as (e: unknown) => void
    expect(warn).toBeTypeOf("function")
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown }
    warn(event)
    expect(event.preventDefault).toHaveBeenCalled()
    // Chrome before 119 and Safari only ask when returnValue is set.
    expect(event.returnValue).toBe("")
  })

  it("is not there, and asks nothing, with nothing to save", () => {
    const add = vi.spyOn(window, "addEventListener")
    bar(false)
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false)
  })
})
