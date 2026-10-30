import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The panel's Type row (A8K, D-PJ-9): a plain Task reads as Task; whoever may
// change the task picks from the project's types, and a change the server
// refuses goes back, said in words.

const toast = vi.fn()
const setTaskType = vi.fn()
const types = [
  { id: "t0", builtin: "task", name: "Task", icon: "task" },
  { id: "t1", builtin: "bug", name: "Bug", icon: "bug" },
  { id: "x9", name: "Spike", icon: "flask", own: true },
]
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => (url ? { data: { data: types }, isLoading: false } : { isLoading: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/lib/work/keysApi", () => ({ projectTypesPath: (p: string) => `/project/${p}/types`, setTaskType: (...a: unknown[]) => setTaskType(...a) }))

import { TaskTypeField } from "./TaskTypeField"

afterEach(() => {
  cleanup()
  toast.mockReset()
  setTaskType.mockReset()
})

const openPicker = () => {
  const trigger = screen.getByRole("button", { name: /^Type: / })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("a task's type in its panel", () => {
  it("reads Task for a plain task, and as text for someone who can't change it", () => {
    render(<TaskTypeField taskUUID="a" projectUUID="p" canEdit={false} onChanged={() => {}} />)
    expect(screen.getByText("Task")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Type: / })).toBeNull()
  })

  it("offers the project's types and saves the one picked", async () => {
    const changed = vi.fn()
    setTaskType.mockResolvedValue({ id: "t1", builtin: "bug", name: "Bug", icon: "bug" })
    render(<TaskTypeField taskUUID="a" projectUUID="p" canEdit onChanged={changed} />)
    openPicker()
    expect(await screen.findByRole("menuitem", { name: /Spike/ })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: /Bug/ })))
    await waitFor(() => expect(setTaskType).toHaveBeenCalledWith("a", "t1"))
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ builtin: "bug" }))
  })

  it("puts the type back and says why when the server refuses", async () => {
    const changed = vi.fn()
    setTaskType.mockRejectedValue({ response: { status: 403, data: { msg: "You can't change this task." } } })
    render(<TaskTypeField taskUUID="a" projectUUID="p" canEdit type={{ id: "t1", builtin: "bug", name: "Bug", icon: "bug" }} onChanged={changed} />)
    openPicker()
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /Spike/ })))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ builtin: "bug" }))
    expect(toast.mock.calls[0][0].title).toBe("Couldn't change the type")
  })

  it("picking Task stores no type", async () => {
    setTaskType.mockResolvedValue(null)
    render(<TaskTypeField taskUUID="a" projectUUID="p" canEdit type={{ id: "t1", builtin: "bug", name: "Bug", icon: "bug" }} onChanged={() => {}} />)
    openPicker()
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /^Task/ })))
    await waitFor(() => expect(setTaskType).toHaveBeenCalledWith("a", ""))
  })
})
