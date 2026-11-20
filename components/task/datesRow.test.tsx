import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MediaQueryProvider } from "@/context/MediaQueryContext"

import { DatesProperty } from "./panelParts"

afterEach(cleanup)

// The panel's Dates row (work.md W29) is one label and one line, "9 Oct → 11 Oct":
// its two date fields once drew a labelled row each inside it ("Start date
// 9 Oct" over "Due date 11 Oct"), a second label column that wrapped
// "9 / Oct" on the task page.
describe("the Dates property", () => {
  it("is one row with one label, the two ends side by side", () => {
    const { container } = render(
      <MediaQueryProvider>
        <DatesProperty isAdmin start={new Date(2026, 9, 9)} due={new Date(2026, 9, 11)} done={false} onStart={() => {}} onDue={() => {}} />
      </MediaQueryProvider>,
    )
    const row = container.querySelector("[data-property=dates]")!
    expect(row.textContent).not.toMatch(/Start date|Due date/)
    expect(row.querySelectorAll("[data-property], [data-field-empty]").length).toBe(0)
    expect(row.querySelectorAll("button").length).toBe(2)
  })

  it("shows the task's SLA beside when it is due, and a restricted task's SLA not at all (linear-24 W2)", async () => {
    const { default: SlaChip } = await import("@/components/task/SlaChip")
    const sla = { state: "breached" as const }
    const { container, rerender } = render(
      <MediaQueryProvider>
        <DatesProperty isAdmin done={false} onStart={() => {}} onDue={() => {}} sla={<SlaChip sla={sla} />} />
      </MediaQueryProvider>,
    )
    expect(container.querySelector("[data-property=dates]")!.textContent).toContain("Breached")
    rerender(
      <MediaQueryProvider>
        <DatesProperty isAdmin done={false} onStart={() => {}} onDue={() => {}} sla={<SlaChip sla={sla} hidden />} />
      </MediaQueryProvider>,
    )
    expect(container.querySelector("[data-property=dates]")!.textContent).not.toContain("Breached")
  })

  it("offers nothing to someone who can't change the dates: empty, it says None", () => {
    const { container } = render(
      <MediaQueryProvider>
        <DatesProperty isAdmin={false} done={false} onStart={() => {}} onDue={() => {}} />
      </MediaQueryProvider>,
    )
    const row = container.querySelector("[data-property=dates]")!
    expect(row.textContent).not.toMatch(/Add dates/)
    expect(row.textContent).toContain("None")
  })
})
