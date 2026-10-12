import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// TN-BUG-8: focus time holds a teammate's pushes as a pause does, but the bar
// above a DM knew only a pause and quiet hours, so during Maya's focus block
// Jonas was told nothing, or, once the server said "focus", that she was in
// quiet hours.

let status: { reason?: string; until?: string } | undefined
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: status ? { data: status } : undefined }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { HeldNotificationsBar } = await import("@/components/messages/heldNotificationsBar")

afterEach(cleanup)

describe("the held bar above a DM", () => {
  it.each([
    ["focus", /^Maya is in focus time until .+\./],
    ["paused", /^Maya paused notifications until .+\./],
    ["quiet_hours", /^Maya is in quiet hours until .+\./],
  ])("says why for %s", (reason, words) => {
    status = { reason, until: "2026-10-13T10:30:00Z" }
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(screen.getByRole("status").textContent).toMatch(words)
    expect(screen.getByRole("button", { name: "Notify anyway" })).toBeInTheDocument()
  })

  it("is not there when nothing is held", () => {
    status = {}
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(screen.queryByRole("status")).toBeNull()
  })
})
