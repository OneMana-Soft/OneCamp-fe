import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => <div data-testid="link-section" /> }))
const { ProjectShareDialog } = await import("@/components/project/ProjectShareDialog")

afterEach(() => cleanup())

describe("sharing a project with a client (work.md W50)", () => {
  it("shows the client's page in miniature and says what they can and can't see", () => {
    render(<ProjectShareDialog projectId="p1" open onOpenChange={() => {}} />)
    const preview = document.querySelector("[data-client-preview]")!
    expect(preview.querySelector("[data-project-tile]")).not.toBeNull()
    expect(preview.textContent).toContain("Guest")
    expect(screen.getByText(/No other project, channel/)).toBeInTheDocument()
    expect(screen.getByTestId("link-section")).toBeInTheDocument()
  })
})
