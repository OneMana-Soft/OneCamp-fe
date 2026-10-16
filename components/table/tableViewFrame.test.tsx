import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { SpotCalendar, SpotTasks } from "@/components/ui/graphics"
import { TableViewState } from "@/components/table/TableViewFrame"

afterEach(cleanup)

// QA PTC-48 (14 Oct): a board without a select column drew an import's tray,
// a download arrow; each view now draws its own picture.
describe("a view that needs a column", () => {
  it.each([
    ["select", "board", SpotTasks],
    ["date", "calendar", SpotCalendar],
  ] as const)("draws its own picture for a %s column (%s)", (column, view, Spot) => {
    const { container } = render(<TableViewState kind="needs-column" column={column} view={view} hue="sky" />)
    expect(container.querySelector("[data-spot]")?.outerHTML).toBe(renderToStaticMarkup(<Spot hue="sky" />))
  })
})
