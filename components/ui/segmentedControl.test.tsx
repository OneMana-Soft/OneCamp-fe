import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SegmentedControl } from "@/components/ui/segmentedControl"

afterEach(cleanup)

const OPTIONS = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const

// One segmented choice for the app, replacing about eight hand-made copies at
// two heights, some of which marked the choice with bg-background alone (1.03:1
// against the well).
describe("the segmented control", () => {
  it("is a radio group whose options are radios, with the choice checked", () => {
    render(<SegmentedControl aria-label="Activity digest" value="daily" onValueChange={() => {}} options={OPTIONS} />)
    const group = screen.getByRole("radiogroup", { name: "Activity digest" })
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.textContent)).toEqual(["Off", "Daily", "Weekly"])
    expect(screen.getByRole("radio", { name: "Daily" }).getAttribute("aria-checked")).toBe("true")
    expect(group.getAttribute("aria-orientation")).toBe("horizontal")
  })

  it("reports the option picked", () => {
    const change = vi.fn()
    render(<SegmentedControl aria-label="Digest" value="off" onValueChange={change} options={OPTIONS} />)
    fireEvent.click(screen.getByRole("radio", { name: "Weekly" }))
    expect(change).toHaveBeenCalledWith("weekly")
  })

  it("raises the choice on the card colour with a hairline, never the page colour alone", () => {
    render(<SegmentedControl aria-label="Digest" value="off" onValueChange={() => {}} options={OPTIONS} />)
    const item = screen.getByRole("radio", { name: "Off" })
    expect(item.className).toContain("data-[state=checked]:bg-card")
    expect(item.className).toContain("data-[state=checked]:ring-1")
    expect(item.className).not.toContain("data-[state=checked]:bg-background")
  })

  it("is an input's height beside one: 36px from md up (28px options in a 4px well), 44px on a phone", () => {
    render(<SegmentedControl aria-label="Digest" value="off" onValueChange={() => {}} options={OPTIONS} />)
    const group = screen.getByRole("radiogroup", { name: "Digest" })
    const item = screen.getByRole("radio", { name: "Off" })
    expect(group.className).toContain("p-1")
    expect(item.className).toMatch(/(^|\s)h-9(\s|$)/)
    expect(item.className).toContain("md:h-7")
  })
})
