import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import { ScatterChart, niceCeil, type ScatterPoint } from "@/components/charts/ScatterChart"

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

afterEach(cleanup)

const pts: ScatterPoint[] = [
  { id: "a", x: 0, y: 10, label: "First", detail: "10 h", href: "/app/task/a" },
  { id: "b", x: 100, y: 40, label: "Last", detail: "40 h", muted: true },
]
const chart = (points = pts) =>
  render(
    <ScatterChart
      title="Cycle time"
      points={points}
      guides={[{ y: 20, label: "Median" }, { y: 30, label: "85%", dashed: true }]}
      band={{ from: 5, to: 35, label: "25th to 95th" }}
      xDomain={[0, 100]}
      xTicks={[{ at: 0, label: "Start" }, { at: 100, label: "End" }]}
      yFormat={(v) => `${v} h`}
      summary="Two tasks"
      empty="Nothing done."
      linkLabel="Open task"
    />,
  )

describe("ScatterChart", () => {
  it("rounds the top of its axis up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect([0, 0.3, 7, 12, 21, 40, 41, 900].map(niceCeil)).toEqual([1, 0.5, 10, 20, 25, 50, 50, 1000])
  })

  it("places each dot by a share of the width, so it needs no measuring, a margin in from each edge", () => {
    const { container } = chart()
    const dots = [...container.querySelectorAll("[data-scatter-point] circle:first-child")]
    // The faint ones first, so the slice looked at draws on top.
    expect(dots.map((c) => c.getAttribute("cx"))).toEqual(["97%", "3%"])
    expect(container.querySelectorAll('[data-scatter-point="muted"]')).toHaveLength(1)
    expect(screen.getByRole("img", { name: "Two tasks" })).toBeTruthy()
  })

  it("draws its guides and band, each in the legend, against an axis rounded up past the highest", () => {
    const { container } = chart()
    expect(container.querySelectorAll("[data-scatter-guide]")).toHaveLength(2)
    expect(container.querySelectorAll("[data-scatter-guide]")[1].getAttribute("stroke-dasharray")).toBe("5 4")
    expect(container.querySelector("[data-scatter-band]")).toBeTruthy()
    for (const words of ["Median", "85%", "25th to 95th", "50 h", "25 h", "0 h", "Start", "End"]) expect(screen.getByText(words)).toBeTruthy()
  })

  it("shows a dot's tip, with its link, on a tap, and puts it away on Escape", () => {
    const { container } = chart()
    const targets = container.querySelectorAll('[data-scatter-point=""] circle:last-child')
    fireEvent.click(targets[0])
    const tip = screen.getByRole("tooltip")
    expect(tip.textContent).toContain("First")
    expect(tip.textContent).toContain("10 h")
    expect(screen.getByRole("link", { name: "Open task" }).getAttribute("href")).toBe("/app/task/a")
    fireEvent.keyDown(tip, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("says so in a sentence when there is nothing to draw", () => {
    const { container } = chart([])
    expect(screen.getByText("Nothing done.")).toBeTruthy()
    expect(container.querySelector("svg[role=img]")).toBeNull()
  })
})
