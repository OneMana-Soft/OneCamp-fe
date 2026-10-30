import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { FieldsMenu } from "@/components/table/TableMenus"
import type { TableField } from "@/services/tableService"

afterEach(cleanup)

const fields: TableField[] = [
  { id: "name", table_id: "t", name: "Name", type: "text", config: "{}", position: 0 },
  { id: "amount", table_id: "t", name: "Amount", type: "number", config: "{}", position: 1 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 2 },
]

// Diet step 4 (B4): the toolbar's Fields comes from the menus' chunk; it shows and hides as it did on the page.
describe("the toolbar's Fields", () => {
  it("names each field shown or hidden, keeps the primary, and shows or hides one a click at a time", () => {
    const onHidden = vi.fn()
    render(<FieldsMenu trigger={<button type="button">Fields</button>} open onOpenChange={() => {}} fields={fields} hidden={["notes"]} onHidden={onHidden} />)
    const name = screen.getByRole("button", { name: /^Name/ })
    expect(name.hasAttribute("disabled")).toBe(true)
    expect(name.textContent).toContain("Primary")
    expect(screen.getByRole("button", { name: /^Amount/ }).querySelector('[aria-label="Shown"]')).not.toBeNull()
    expect(screen.getByRole("button", { name: /^Notes/ }).querySelector('[aria-label="Hidden"]')).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Amount/ }))
    expect(onHidden).toHaveBeenLastCalledWith(["notes", "amount"])
    fireEvent.click(screen.getByRole("button", { name: /^Notes/ }))
    expect(onHidden).toHaveBeenLastCalledWith([])
  })
})
