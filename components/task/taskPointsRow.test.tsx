import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const answers = vi.hoisted(() => ({ estimates: undefined as unknown, isError: undefined as unknown, mutate: (() => {}) as () => void }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: answers.estimates, isError: answers.isError, mutate: answers.mutate }) }))

import { TaskPointsRow } from "./taskPointsRow"

const SHIRT = { kind: "tshirt", extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["XS", "S", "M", "L", "XL"] }

afterEach(() => {
  cleanup()
  answers.estimates = undefined
  answers.isError = undefined
})

// linear-05: the task panel's Points row, beside its hours. Its scale comes
// with the task (the "estimates" part), so it paints with the panel.
describe("a task's points", () => {
  it("isn't there in a project that estimates in hours, nor while the scale is read", () => {
    answers.estimates = { data: { scale: null, kinds: [], can_edit: true } }
    const { container, rerender } = render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit />)
    expect(container.querySelector("[data-property='points']")).toBeNull()
    answers.estimates = undefined
    rerender(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit />)
    expect(container.querySelector("[data-property='points']")).toBeNull()
  })

  it("paints the row with the panel, its value's place held, then names the size for a reader", async () => {
    answers.estimates = { data: { scale: SHIRT, kinds: [], can_edit: false } }
    const { container } = render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit={false} />)
    expect(container.querySelector("[data-property='points']")?.textContent).toContain("Points")
    expect(await screen.findByText("M")).toBeTruthy()
    expect(screen.queryByRole("combobox")).toBeNull()
    cleanup()
    render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" canEdit={false} />)
    expect(await screen.findByText("None")).toBeTruthy()
  })

  it("gives whoever may edit the task the scale's picker, a menu like the Type row's, named for the row", async () => {
    answers.estimates = { data: { scale: SHIRT, kinds: [], can_edit: false } }
    render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit />)
    const pick = await screen.findByRole("button", { name: "Points: M. Change them" })
    expect(pick.getAttribute("aria-haspopup")).toBe("menu")
    expect(pick.textContent).toBe("M")
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("says so in its row when the scale can't be read, and Try again reads it again", () => {
    answers.isError = new Error("down")
    answers.mutate = vi.fn()
    render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit />)
    fireEvent.click(screen.getByRole("button", { name: /Couldn't load the points\. Try again/ }))
    expect(answers.mutate).toHaveBeenCalledTimes(1)
  })

  // asana-12, main's ruling: a task made with no network has its Points row. The device gives it its project's
  // scale when it holds one (lib/offline/tasks); when it doesn't, the row says calmly when points can be set.
  it("says, for a task made on this device whose project's scale it doesn't hold, to set points once back online: no error, no Try again", () => {
    answers.isError = new Error("no network")
    const { container } = render(<TaskPointsRow taskUUID="offline-7a5c0000-0000-4000-8000-000000000001" projectUUID="p-1" canEdit />)
    const row = container.querySelector("[data-property='points']")
    expect(row?.textContent).toBe("PointsSet points when you're back online")
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByText(/Couldn't load/)).toBeNull()
  })

  it("works for a task made on this device from the scale the device holds, as for any task", async () => {
    answers.estimates = { data: { scale: SHIRT, kinds: [], can_edit: false } }
    render(<TaskPointsRow taskUUID="offline-7a5c0000-0000-4000-8000-000000000001" projectUUID="p-1" canEdit />)
    expect(await screen.findByRole("button", { name: "Points: none. Change them" })).toBeTruthy()
  })

  it("isn't there for a reader the project refuses: a task's assignee from outside it", () => {
    for (const status of [403, 404]) {
      answers.isError = Object.assign(new Error("refused"), { isAxiosError: true, response: { status, data: {} } })
      const { container } = render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit={false} />)
      expect(container.querySelector("[data-property='points']")).toBeNull()
      expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
      cleanup()
    }
    // A failure that isn't a refusal still says so, with Try again.
    answers.isError = Object.assign(new Error("down"), { isAxiosError: true, response: { status: 502, data: {} } })
    render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit={false} />)
    expect(screen.getByRole("button", { name: /Couldn't load the points\. Try again/ })).toBeTruthy()
  })

  it("says so too when the scale came with the task as that part's error", () => {
    answers.estimates = { error: "The estimates couldn't be read just now." }
    render(<TaskPointsRow taskUUID="t-1" projectUUID="p-1" points={3} canEdit={false} />)
    expect(screen.getByRole("button", { name: /Couldn't load the points/ })).toBeTruthy()
  })
})
