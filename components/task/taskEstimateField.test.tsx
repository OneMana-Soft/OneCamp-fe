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

describe("the Estimate field", () => {
  it("saves on Enter, reading a bare number as hours", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" canEdit />)
    fireEvent.change(field(), { target: { value: "8" } })
    fireEvent.keyDown(field(), { key: "Enter" })
    fireEvent.blur(field())
    expect(post).toHaveBeenCalledWith(expect.any(String), { task_uuid: "t", task_estimate_minutes: 480 }, expect.anything())
  })

  it("puts the estimate back on Escape and saves nothing", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={120} canEdit />)
    fireEvent.change(field(), { target: { value: "5h" } })
    fireEvent.keyDown(field(), { key: "Escape" })
    fireEvent.blur(field())
    expect(post).not.toHaveBeenCalled()
    expect(field().value).toBe("2h")
  })

  it("is read-only for someone who can't change the task", () => {
    render(<TaskEstimateField taskUUID="t" projectUUID="p" minutes={90} canEdit={false} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("1h 30m")).toBeTruthy()
  })
})
