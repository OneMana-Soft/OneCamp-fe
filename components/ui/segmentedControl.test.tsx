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

  // Design v3 (admin §1.4): the choice is the raised surface at e-sel, one
  // thumb that slides between options on transform, never a layout property.
  it("marks the choice with one sliding thumb, raised at e-sel, moved by transform", () => {
    const { container } = render(<SegmentedControl aria-label="Digest" value="off" onValueChange={() => {}} options={OPTIONS} />)
    const thumb = container.querySelector("[data-segment-thumb]") as HTMLElement
    expect(thumb).toBeTruthy()
    expect(thumb.className).toContain("bg-raised")
    expect(thumb.className).toContain("shadow-sel")
    expect(thumb.className).toContain("transition-transform")
    expect(thumb.className).not.toMatch(/transition-(all|\[width|\[left)/)
    // Before it is measured, the layer raises the chosen option itself
    // (app/interaction.css, a [data-segmented] well whose thumb is off).
    const item = screen.getByRole("radio", { name: "Off" })
    expect(item.getAttribute("data-interactive")).toBe("tab")
    expect(item.closest("[data-segmented]")?.hasAttribute("data-thumb")).toBe(true)
    expect(item.className).not.toContain("data-[state=checked]:bg-background")
  })

  it("is a 28px track on the press fill from md up, 36px on a phone", () => {
    render(<SegmentedControl aria-label="Digest" value="off" onValueChange={() => {}} options={OPTIONS} />)
    const group = screen.getByRole("radiogroup", { name: "Digest" })
    const item = screen.getByRole("radio", { name: "Off" })
    expect(group.className).toContain("bg-press")
    expect(group.className).toContain("p-0.5")
    expect(item.className).toMatch(/(^|\s)h-8(\s|$)/)
    expect(item.className).toContain("md:h-6")
  })
})
