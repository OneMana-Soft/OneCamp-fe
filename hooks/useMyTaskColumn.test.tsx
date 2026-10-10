import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))

const { useMyTaskColumn } = await import("@/hooks/useMyTaskColumn")

afterEach(cleanup)

describe("My Tasks' project column", () => {
  it("shows each project in its own colour, as the sidebar and the phone list do", () => {
    const { result } = renderHook(() => useMyTaskColumn())
    const column = result.current.columns.find((c) => "accessorKey" in c && c.accessorKey === "task_project_name")!
    const id = "0c3b5f86-5911-49c9-9f0c-24a47241a6bd"
    const cell = column.cell as (ctx: { row: { original: object } }) => ReactNode
    const { container, getByRole } = render(<>{cell({ row: { original: { task_project: { project_uuid: id, project_name: "Q4 launch" } } } })}</>)
    const link = getByRole("link")
    expect(link.textContent).toBe("Q4 launch")
    const mark = container.querySelector("[data-hue]")
    expect(mark?.getAttribute("data-hue")).toBe(hueFor(id))
    expect(link.contains(mark)).toBe(true)
  })
})
