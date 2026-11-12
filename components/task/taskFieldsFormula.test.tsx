import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TaskField } from "@/lib/tasks/fields"

// The task panel's formula fields (J-F WEB): a formula's value is worked out
// by the server, so no one sets it, an admin included: it reads as its
// result, never a box. A value a formula reads, once saved, comes back with
// refetch: true, and the task is read again for the formulas' new values.

const post = vi.fn<(...a: unknown[]) => Promise<{ data: { data: { value: unknown; refetch?: boolean } } }>>(() => Promise.resolve({ data: { data: { value: null } } }))
const setField = vi.fn()
const rereadTask = vi.fn()
let fields: TaskField[] = []

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ optimisticSetTaskField: (...a: unknown[]) => setField(...a), rereadTask: (...a: unknown[]) => rereadTask(...a) }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields, canEdit: true, isLoading: false, refresh: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/project/ProjectFieldsDialog", () => ({ ProjectFieldsDialog: () => null }))

const { TaskFieldsSection } = await import("@/components/task/taskFieldsSection")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const base = { project_id: "p", options: [], on_card: false, position: 0 }
const spend: TaskField = { ...base, id: "f-spend", name: "Spend", type: "number", filter_id: "field_x1" }
const double: TaskField = { ...base, id: "f-double", name: "Spend x 2", type: "formula", formula: "{Spend} * 2", result: "number", filter_id: "field_x2" }

describe("a formula field in the task panel", () => {
  it("reads as its result to an admin too, with no box to set it", () => {
    fields = [double]
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-double": 2500 }} canEdit members={[]} />)
    expect(screen.getByText((2500).toLocaleString())).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByLabelText("Spend x 2", { selector: "input, button" })).toBeNull()
  })

  it("can't be worked out: the server's why in a warning chip", () => {
    fields = [double]
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-double": { error: "Spend was deleted" } }} canEdit members={[]} />)
    expect(screen.getByTitle("Spend was deleted")).toBeTruthy()
  })

  it("reads the task again once a value a formula reads is saved (refetch)", async () => {
    fields = [spend, double]
    post.mockResolvedValueOnce({ data: { data: { value: 1300, refetch: true } } })
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-spend": 1250, "f-double": 2500 }} canEdit members={[]} />)
    fireEvent.click(screen.getByLabelText("Spend"))
    const box = screen.getByLabelText("Spend")
    fireEvent.change(box, { target: { value: "1300" } })
    await act(async () => {
      fireEvent.blur(box)
    })
    await vi.waitFor(() => expect(rereadTask).toHaveBeenCalledWith("t", "p"))
  })

  it("reads nothing again when no formula reads the value", async () => {
    fields = [spend]
    post.mockResolvedValueOnce({ data: { data: { value: 1300 } } })
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-spend": 1250 }} canEdit members={[]} />)
    fireEvent.click(screen.getByLabelText("Spend"))
    const box = screen.getByLabelText("Spend")
    fireEvent.change(box, { target: { value: "1300" } })
    await act(async () => {
      fireEvent.blur(box)
    })
    await vi.waitFor(() => expect(setField).toHaveBeenCalledWith("t", "p", "f-spend", 1300))
    expect(rereadTask).not.toHaveBeenCalled()
  })
})
