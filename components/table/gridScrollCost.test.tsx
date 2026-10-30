import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LazyPopover } from "./LazyPopover"
import { PopoverContent } from "@/components/ui/popover"

// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))

/**
 * What scrolling a big table costs (content wave, 11 Oct 2026). Scrolling
 * the Launch budget grown to 1,000 rows held 29 frames a second on a 4x
 * slowed CPU: the whole grid (header menus, summary bar) re-rendered on every
 * scroll frame, every row was measured, and every select, date, relation and
 * error cell mounted a closed Radix popover. Now 37 at 4x and 57 at 1x.
 */
const src = (f: string) => readFileSync(join(process.cwd(), "components/table", f), "utf8")

describe("grid scroll cost", () => {
  it("keeps the virtualizer in GridBody, so scrolling renders only the rows", () => {
    // One window for the grid and the phone's list (viewWindow), each called
    // in the memo body that draws the rows.
    expect(src("viewWindow.ts").match(/useVirtualizer\(/g) || []).toHaveLength(1)
    const grid = src("DataTableGrid.tsx")
    expect(grid).not.toMatch(/useVirtualizer\(/)
    expect(grid.match(/useViewWindow\(/g) || []).toHaveLength(1)
    const body = grid.slice(grid.indexOf("const GridBody = React.memo("))
    expect(body.indexOf("useViewWindow(")).toBeGreaterThan(-1)
    expect(body.indexOf("useViewWindow(")).toBeLessThan(body.indexOf("function GridRow("))
    const list = src("TableRowList.tsx")
    expect(list).not.toMatch(/useVirtualizer\(/)
    const listBody = list.slice(list.indexOf("const ListBody = React.memo("))
    expect(listBody.indexOf("useViewWindow(")).toBeGreaterThan(-1)
    expect(listBody.indexOf("useViewWindow(")).toBeLessThan(listBody.indexOf("function ListRow("))
  })

  it("never measures rows (each is a preset height)", () => {
    for (const f of ["DataTableGrid.tsx", "TableRowList.tsx", "viewWindow.ts"]) expect(src(f), f).not.toMatch(/measureElement/)
  })

  it("mounts no popover in a closed cell", () => {
    for (const f of ["gridCells.tsx", "RelationCell.tsx"]) {
      const s = src(f)
      expect(s, f).not.toMatch(/<Popover[\s>]/)
      expect(s, f).toMatch(/<LazyPopover/)
    }
  })

  it("formats cell numbers and dates without building an Intl formatter per cell", () => {
    const lib = (f: string) => readFileSync(join(process.cwd(), "lib/tables", f), "utf8")
    for (const [name, text] of [
      ["gridCells.tsx", src("gridCells.tsx")],
      ["cellFormat.ts", lib("cellFormat.ts")],
      ["formula.ts", lib("formula.ts")],
      ["summary.ts", lib("summary.ts")],
    ]) {
      expect(text, name).not.toMatch(/\.toLocaleString\([^)]*\{/)
    }
  })

  it("LazyPopover renders only its trigger until first opened, then opens", () => {
    function Probe() {
      const [open, setOpen] = React.useState(false)
      return (
        <LazyPopover open={open} onOpenChange={setOpen} trigger={<button type="button">Pick</button>}>
          <PopoverContent>Options</PopoverContent>
        </LazyPopover>
      )
    }
    const onWarn = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<Probe />)
    expect(screen.getByRole("button", { name: "Pick" }).getAttribute("aria-haspopup")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Pick" }))
    expect(screen.getByText("Options")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pick" }).getAttribute("aria-expanded")).toBe("true")
    onWarn.mockRestore()
  })
})
