import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

afterEach(cleanup)

describe("TableHead and TableCell align", () => {
  it("right-aligns a number column with tabular figures, header and cell alike", () => {
    render(
      <Table>
        <TableHeader><TableRow><TableHead align="right">Hours</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell align="right">12.5</TableCell></TableRow></TableBody>
      </Table>,
    )
    for (const el of [screen.getByText("Hours"), screen.getByText("12.5")]) {
      expect(el.className).toContain("text-right")
      expect(el.className).toContain("tabular-nums")
      // A class, not the deprecated HTML attribute.
      expect(el.getAttribute("align")).toBeNull()
    }
  })

  it("centres, and leaves cells without align as they were", () => {
    render(
      <Table>
        <TableBody><TableRow><TableCell align="center">Done</TableCell><TableCell>Plain</TableCell></TableRow></TableBody>
      </Table>,
    )
    expect(screen.getByText("Done").className).toContain("text-center")
    expect(screen.getByText("Plain").className).not.toMatch(/text-(right|center)/)
  })

  it("lets a caller's class still win", () => {
    render(<Table><TableBody><TableRow><TableCell align="right" className="text-left">x</TableCell></TableRow></TableBody></Table>)
    expect(screen.getByText("x").className).toContain("text-left")
    expect(screen.getByText("x").className).not.toContain("text-right")
  })
})
