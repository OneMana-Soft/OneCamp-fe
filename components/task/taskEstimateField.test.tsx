import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

afterEach(() => {
  cleanup()
  post.mockClear()
})

const post = vi.fn(() => Promise.resolve({ data: {} }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...(a as [])) }, OWN_ERRORS: {} }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ optimisticUpdateTasks: () => {} }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }))

import { TaskEstimateField } from "@/components/task/taskEstimateField"

const field = () => screen.getByLabelText("Estimate") as HTMLInputElement
// A value at rest, the size of every other; a box once it is chosen to type in (PTC-44).
const edit = () => fireEvent.click(screen.getByLabelText("Estimate"))

describe("the Estimate field", () => {
  it("saves on Enter, reading a bare number as hours", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" canEdit />)
    edit()
    fireEvent.change(field(), { target: { value: "8" } })
    fireEvent.keyDown(field(), { key: "Enter" })
    fireEvent.blur(field())
    expect(post).toHaveBeenCalledWith(expect.any(String), { task_uuid: "t", task_estimate_minutes: 480 }, expect.anything())
  })

  it("puts the estimate back on Escape and saves nothing", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={120} canEdit />)
    edit()
    fireEvent.change(field(), { target: { value: "5h" } })
    fireEvent.keyDown(field(), { key: "Escape" })
    fireEvent.blur(field())
    expect(post).not.toHaveBeenCalled()
    expect(field().textContent).toBe("2h")
    // The keyboard is back on the value it left.
    expect(document.activeElement).toBe(field())
  })

  it("is read-only for someone who can't change the task", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={90} canEdit={false} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("1h 30m")).toBeTruthy()
  })
})

describe("the Estimate field's look", () => {
  it("reads as a value until it is typed in: no box at rest, and an example of what to type", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" canEdit />)
    // At rest it is the panel's value button, not a box a phone draws at 16px (PTC-44).
    expect(field().tagName).toBe("BUTTON")
    expect(field().textContent).toBe("Add estimate")
    edit()
    expect(field().tagName).toBe("INPUT")
    expect(field().className).toMatch(/border-transparent/)
    expect(field().className).not.toMatch(/(^|\s)border-input(\s|$)/)
    expect(field().placeholder).toBe("Add estimate")
    expect(document.activeElement).toBe(field())
  })

  it("reads logged time against the estimate, with a bar", () => {
    const { container } = render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={180} loggedSeconds={155 * 60} canEdit />)
    expect(screen.getByText("2h 35m")).toBeTruthy()
    expect(screen.getByText("of")).toBeTruthy()
    expect(container.querySelector("[data-estimate-bar]")).not.toBeNull()
    expect(container.querySelector("[data-estimate-over]")).toBeNull()
  })

  it("says how far over the estimate it is, in words and with a cap past the bar", () => {
    const { container } = render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={180} loggedSeconds={200 * 60} canEdit />)
    expect(screen.getByText("· 20m over")).toBeTruthy()
    expect(container.querySelector("[data-estimate-over]")).not.toBeNull()
    expect(container.querySelector("[data-bar-fill]")!.className).toContain("bg-camp-sun")
  })
})
