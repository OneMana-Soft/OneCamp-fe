import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// QA DSA-34 (14 Oct 2026): New doc on the docs home's Workspace tab sent
// {"space":"private","doc_private":true}; the new doc was private.

const create = vi.fn(async () => undefined)
vi.mock("@/components/doc/useCreateDoc", () => ({ useCreateDoc: () => ({ create, busy: null }) }))

const { NewDocButton } = await import("./NewDocButton")

afterEach(() => {
  cleanup()
  create.mockClear()
})

describe("New doc", () => {
  it("makes its blank doc where it's told: the workspace from that tab, private otherwise", () => {
    render(<NewDocButton space="workspace" />)
    fireEvent.click(screen.getByRole("button", { name: /New doc/ }))
    expect(create).toHaveBeenLastCalledWith({ space: "workspace" })
    cleanup()
    render(<NewDocButton />)
    fireEvent.click(screen.getByRole("button", { name: /New doc/ }))
    expect(create).toHaveBeenLastCalledWith({ space: undefined })
  })
})
