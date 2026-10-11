import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { NowLine } from "./NowLine"

afterEach(cleanup)

// content.md C08: now is the brand, never the destructive red; faint across
// the week, strong in today's column, the time in a pill in the gutter.
describe("the now line", () => {
  it("is the brand, by transform, with the time in the gutter", () => {
    render(<NowLine top={560} gutter={56} columns={7} todayIndex={3} now={new Date(2026, 9, 15, 10, 0)} />)
    const line = document.querySelector("[data-now-line]") as HTMLElement
    expect(line.style.transform).toBe("translateY(560px)")
    expect(document.querySelector("[data-now-pill]")?.className).toMatch(/bg-brand/)
    expect(document.querySelector("[data-now-pill]")?.textContent).toBe("10:00")
    const today = document.querySelector("[data-now-today]") as HTMLElement
    expect(today.className).toMatch(/bg-brand/)
    expect(today.style.left).toMatch(/^42\.85/)
  })

  it("draws no strong segment on a week without today", () => {
    render(<NowLine top={0} gutter={56} columns={7} todayIndex={-1} now={new Date()} />)
    expect(document.querySelector("[data-now-today]")).toBeNull()
  })

  it("never comes back as the destructive colour in the week grid", () => {
    expect(readFileSync("components/calendar/weekView.tsx", "utf8")).not.toMatch(/bg-destructive/)
  })
})
