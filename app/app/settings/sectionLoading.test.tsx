import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SectionLoading } from "./SectionLoading"

afterEach(cleanup)

// The settings pages that wait on a permission or the server's AI drew a
// bordered box of three rows under the h1, then the section arrived with its
// own title and a second skeleton, and the page jumped 90 to 190px. While
// waiting, the page now draws the section it will show: a title, its line,
// and the list's own rows.
describe("a settings section while it loads", () => {
  it("draws a section's title, its line and its list, under one loading label", () => {
    render(<SectionLoading label="Loading agents and skills" />)
    const status = screen.getByRole("status", { name: "Loading agents and skills" })
    expect(status.querySelector("[data-section-loading-title]")).toBeTruthy()
    const list = status.querySelector("[data-section-list-skeleton]") as HTMLElement
    expect(list.className).toContain("rounded-lg border")
    expect(list.getAttribute("role")).toBeNull()
    expect(status.className).not.toMatch(/\bborder\b/)
  })
})
