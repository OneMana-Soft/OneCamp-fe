import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { PageHeader } from "@/components/ui/pageHeader"

/**
 * The header's controls sit on the title's centre line, and the line under
 * the title has the header's whole width. The controls used to sit beside the
 * whole block, bottom-aligned: level with the line under the title rather than
 * the title, and taking their width from that line, so a project's line was
 * cut short ("6 open · 5 due this week · 11 do…") at 1440 with a panel open.
 */
afterEach(cleanup)

describe("PageHeader", () => {
  it("puts the controls in the title's row, centred on it", () => {
    render(
      <PageHeader eyebrow="Project" title="Q4 launch" actions={<button type="button">Bell</button>}>
        <p data-testid="line">6 open · 5 due this week · 11 done</p>
      </PageHeader>,
    )
    const title = screen.getByRole("heading", { level: 1 })
    const row = title.parentElement!
    expect(row.hasAttribute("data-page-title-row")).toBe(true)
    expect(row.className).toContain("items-center")
    expect(row.contains(screen.getByRole("button", { name: "Bell" }))).toBe(true)
  })

  it("gives the line under the title the header's whole width, not the width beside the controls", () => {
    const { container } = render(
      <PageHeader title="Q4 launch" actions={<button type="button">Bell</button>}>
        <p data-testid="line">6 open · 5 due this week · 11 done</p>
      </PageHeader>,
    )
    const header = container.querySelector("header")!
    const line = screen.getByTestId("line")
    expect(line.parentElement).toBe(header)
    expect(line.closest("[data-page-title-row]")).toBeNull()
  })

  it("keeps a 36px control from making the title's row taller than the title", () => {
    const { container } = render(<PageHeader title="Projects" actions={<button type="button">New project</button>} />)
    const actions = container.querySelector("[data-page-actions]")!
    expect(actions.className).toContain("-my-1")
  })
})
