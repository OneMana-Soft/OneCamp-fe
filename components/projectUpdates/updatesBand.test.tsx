import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const h = vi.hoisted(() => ({ canPost: true }))
vi.mock("@/hooks/useProjectUpdates", () => ({
  useProjectUpdates: () => ({
    updates: [],
    canPost: h.canPost,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
    draft: vi.fn(() => new Promise(() => {})),
    aiDraft: vi.fn(),
    post: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
  }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useFeature: () => false, FEATURE_AI: "ai" }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("react-redux", () => ({ useSelector: () => [] }))

const { ProjectUpdates } = await import("./ProjectUpdates")

afterEach(() => {
  cleanup()
  h.canPost = true
})

// PTC-6: Updates had no band, and its composer sat 28px lower and 24px
// further in than every other tab's first row.
describe("a project's Updates tab", () => {
  it("draws the tabs' one band, with New update as its primary", () => {
    const { container } = render(<ProjectUpdates projectId="p" projectName="Q4 launch" />)
    const band = container.querySelector("[data-work-toolbar]")!
    expect(band.className).toContain("border-b")
    fireEvent.click(screen.getByRole("button", { name: "New update" }))
    expect(screen.getByRole("textbox")).toBeTruthy()
  })

  it("offers New update only to those who post updates", () => {
    h.canPost = false
    const { container } = render(<ProjectUpdates projectId="p" />)
    expect(container.querySelector("[data-work-toolbar]")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New update" })).toBeNull()
  })
})
