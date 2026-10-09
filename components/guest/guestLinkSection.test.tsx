import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const createGuestLink = vi.fn()
vi.mock("@/services/guestService", () => ({
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  guestResourceLink: () => "https://acme.test/guest/p/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { GuestLinkSection } from "./GuestLinkSection"

describe("sharing a project with a client", () => {
  afterEach(() => cleanup())

  it("lets the client comment and approve unless told otherwise, and says approvals need it", async () => {
    createGuestLink.mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    expect(screen.getByText("Approving tasks and asking for changes need “Can see and comment”.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("project", "p1", 24 * 14, "comment", false)
  })

  it("still starts a doc's link read only", async () => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection resourceType="doc" resourceId="d1" canShare embedded />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("doc", "d1", 24 * 14, "view", false)
  })
})
