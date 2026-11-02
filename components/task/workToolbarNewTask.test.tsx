import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"

// New task from a list. C opens it; Alt+C, and Alt+click on New task, open it
// on the template picker (linear-09: Linear's Option+C makes an issue from a
// template). A Mac's Option+C types "ç", so Alt+C is read by its key code.

const h = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock("react-redux", () => ({ useDispatch: () => h.dispatch, useSelector: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false }),
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }), usePeople: () => ({ nameOf: () => undefined, people: [] }) }))

const { WorkToolbar } = await import("./WorkToolbar")

function List({ projectId }: { projectId?: string }) {
  const table = useReactTable({ data: [], columns: [], getCoreRowModel: getCoreRowModel() })
  return <WorkToolbar table={table} projectId={projectId} display={<span />} />
}

/** Each New task opened: [its project, whether it's yours, whether it opens on the template picker]. */
const opened = () =>
  h.dispatch.mock.calls
    .map(([a]) => a?.payload)
    .filter((p) => p?.key === "createTask")
    .map(({ data }) => [data.projectId, !!data.assignToMe, !!data.pickTemplate])

const press = (init: KeyboardEventInit, on: Element = document.body) => fireEvent.keyDown(on, init)
const newTaskButton = () => screen.getByRole("button", { name: "New task" })

beforeEach(() => {
  // The list on screen answers its keys; jsdom draws nothing, so it says it's visible.
  Object.defineProperty(HTMLElement.prototype, "checkVisibility", { value: () => true, configurable: true })
})
afterEach(() => {
  cleanup()
  h.dispatch.mockClear()
  delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility
})

describe("New task from a project's list", () => {
  it("opens on C, and on the template picker on Alt+C, as a Mac types it or not, and on Alt+click", () => {
    render(<List projectId="p-launch" />)
    press({ key: "c", code: "KeyC" })
    press({ key: "ç", code: "KeyC", altKey: true })
    press({ key: "c", code: "KeyC", altKey: true })
    fireEvent.click(newTaskButton(), { altKey: true })
    fireEvent.click(newTaskButton())
    expect(opened()).toEqual([
      ["p-launch", false, false],
      ["p-launch", false, true],
      ["p-launch", false, true],
      ["p-launch", false, true],
      ["p-launch", false, false],
    ])
  })

  it("leaves other Alt keys, Ctrl+Alt+C, and Alt+C typed in a field alone", () => {
    render(<List projectId="p-launch" />)
    press({ key: "ƒ", code: "KeyF", altKey: true })
    press({ key: "c", code: "KeyC", ctrlKey: true, altKey: true })
    const field = document.body.appendChild(document.createElement("input"))
    press({ key: "ç", code: "KeyC", altKey: true }, field)
    field.remove()
    expect(opened()).toEqual([])
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("New task from My Tasks", () => {
  it("is yours, on C and on Alt+C, and Alt+C opens it on the template picker", () => {
    render(<List />)
    press({ key: "C", code: "KeyC" })
    press({ key: "ç", code: "KeyC", altKey: true })
    expect(opened()).toEqual([
      [undefined, true, false],
      [undefined, true, true],
    ])
  })
})
