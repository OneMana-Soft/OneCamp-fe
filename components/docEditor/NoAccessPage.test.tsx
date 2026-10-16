import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({ outgoing: [] as unknown[], request: vi.fn(), mutate: vi.fn() }))

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { incoming: [], outgoing: hoisted.outgoing } }, mutate: hoisted.mutate }) }))
vi.mock("@/services/docAccessService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/docAccessService")>()), requestDocAccess: hoisted.request }))

import { NoAccessPage } from "./NoAccessPage"

beforeEach(() => {
  hoisted.outgoing = []
  hoisted.request.mockReset().mockResolvedValue({})
  hoisted.mutate.mockReset()
})
afterEach(cleanup)

describe("a doc that isn't shared with you (E1)", () => {
  it("says so without naming the doc, and asks for the access chosen, with a note", async () => {
    render(<NoAccessPage docId="n1" onGranted={() => {}} />)
    expect(screen.getByRole("heading", { name: "You can't see this doc" })).toBeTruthy()
    fireEvent.click(document.querySelector('[data-choice="edit"]')!)
    fireEvent.change(screen.getByPlaceholderText("What you need it for"), { target: { value: "Reviewing the launch" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Request access" })))
    expect(hoisted.request).toHaveBeenCalledWith("n1", "edit", "Reviewing the launch")
    expect(hoisted.mutate).toHaveBeenCalled()
  })

  // Docs incident, 14 Oct 2026: a request goes only to someone who can answer
  // it (the server's can_request); without one the page says who to ask.
  it("offers no request when nobody could answer it, and says who to ask", () => {
    render(<NoAccessPage docId="n1" onGranted={() => {}} canRequest={false} />)
    expect(screen.getByRole("heading", { name: "You can't see this doc" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull()
    expect(screen.getByText(/Ask whoever sent you the link/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to docs" })).toBeTruthy()
  })

  it("tells an admin that being one opens no doc", () => {
    render(<NoAccessPage docId="n1" onGranted={() => {}} admin />)
    expect(screen.getByText(/Being an admin doesn't open docs/)).toBeTruthy()
  })

  it("says a request is on its way, and opens the doc once it is approved", () => {
    hoisted.outgoing = [{ id: "r", doc_uuid: "n1", level_wanted: "comment", status: "pending", created_at: new Date().toISOString() }]
    const granted = vi.fn()
    const view = render(<NoAccessPage docId="n1" onGranted={granted} />)
    expect(screen.getByText(/You asked to comment on it/)).toBeTruthy()
    expect(document.querySelector("[data-doc-request-sent]")).not.toBeNull()
    expect(granted).not.toHaveBeenCalled()
    hoisted.outgoing = [{ id: "r", doc_uuid: "n1", level_wanted: "comment", status: "approved", created_at: "" }]
    view.rerender(<NoAccessPage docId="n1" onGranted={granted} />)
    expect(granted).toHaveBeenCalled()
  })

  it("opens the doc when the server says they can already, and says what went wrong otherwise", async () => {
    const granted = vi.fn()
    hoisted.request.mockRejectedValueOnce({ response: { status: 409, data: { code: "already" } } })
    render(<NoAccessPage docId="n1" onGranted={granted} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Request access" })))
    expect(granted).toHaveBeenCalled()
    hoisted.request.mockRejectedValueOnce({ response: { status: 500 } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Request access" })))
    expect(screen.getByRole("alert").textContent).toBe("The request wasn't sent. Try again in a moment.")
  })
})
