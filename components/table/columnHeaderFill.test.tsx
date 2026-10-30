import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ColumnHeader } from "@/components/table/ColumnMenu"
import type { AIFill, TableField } from "@/services/tableService"

const summary: TableField = { id: "summary", table_id: "t", name: "Summary", type: "text", config: JSON.stringify({ ai: { prompt: "Sum up the row" } }), position: 1 }
const running: AIFill = { id: "f1", table_id: "t", field_id: "summary", total: 3200, asked: 340, filled: 338, state: "running" }

function header(props: { fill?: AIFill; canManage?: boolean; onStopFill?: () => void }) {
  return render(
    <table>
      <thead>
        <tr>
          <ColumnHeader field={summary} fields={[summary]} tableId="t" canManage={props.canManage ?? true} index={1} openPage={null} onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} fill={props.fill} onStopFill={props.onStopFill} />
        </tr>
      </thead>
    </table>,
  )
}

afterEach(cleanup)

// TABLES-LEAD-26: a column's AI fill runs in the background; its header says
// how far it has got, and one who manages the table stops it there.
describe("a column header while its AI fill runs", () => {
  it("says how far the fill has got, and stops it", () => {
    const stop = vi.fn()
    header({ fill: running, onStopFill: stop })
    expect(screen.getByRole("status").textContent).toBe("Filling 340 of 3,200 in Summary")
    // The header's width is the name's: the count is in Stop's name and tip,
    // never a chip that a narrow column clips (DESIGN-BUILD-15's M1).
    expect(screen.queryByText(/\/3,200/)).toBeNull()
    expect(screen.getByRole("button", { name: "Stop filling Summary: 340 of 3,200 done" }).getAttribute("title")).toBe("Stop filling: 340 of 3,200 done")
    fireEvent.click(screen.getByRole("button", { name: /^Stop filling Summary/ }))
    expect(stop).toHaveBeenCalledTimes(1)
    // Stop is a button of its own, never inside the header's.
    expect(screen.getByRole("button", { name: /^Stop filling Summary/ }).closest("button")?.parentElement?.closest("button")).toBeNull()
  })

  it("shows progress without Stop to one who can't stop it, and nothing when no fill runs", () => {
    header({ fill: running, canManage: false })
    expect(screen.getByRole("status").textContent).toBe("Filling 340 of 3,200 in Summary")
    expect(screen.queryByRole("button", { name: /Stop filling/ })).toBeNull()
    cleanup()
    header({})
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByText(/\/3,200/)).toBeNull()
  })
})
