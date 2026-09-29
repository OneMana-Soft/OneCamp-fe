import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const state = { open: true, connections: [] as unknown[] }
const mutate = vi.fn()
const makeRequest = vi.fn()

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: unknown) => C }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: state }, isLoading: false, mutate }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import MyAssistantsCard from "@/components/ai/MyAssistantsCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.open = true
  state.connections = []
})

describe("MyAssistantsCard", () => {
  it("says so when the workspace keeps outside assistants out, and offers no steps", () => {
    state.open = false
    render(<MyAssistantsCard />)
    expect(screen.getByText(/has not let outside assistants into this workspace/)).toBeTruthy()
    expect(screen.queryByRole("tablist")).toBeNull()
  })

  it("leads with named assistants and shows steps for the one picked", () => {
    render(<MyAssistantsCard />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs[0].textContent).not.toBe("Any MCP client")
    expect(tabs[tabs.length - 1].textContent).toBe("Any MCP client")
    fireEvent.click(screen.getByRole("tab", { name: "ChatGPT" }))
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Developer mode/)
  })

  it("lists a connection and ends it only after it is confirmed", async () => {
    state.connections = [
      { id: "g1", client_name: "ChatGPT", agent_id: "a1", agent_name: "Priya's ChatGPT", scopes: ["tasks:read"], created_at: new Date().toISOString() },
    ]
    render(<MyAssistantsCard />)
    expect(screen.getByText(/acting as Priya's ChatGPT/)).toBeTruthy()
    expect(screen.getByText(/not used yet/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(makeRequest).not.toHaveBeenCalled()
    expect(screen.getByText("It stops working at once.")).toBeTruthy()

    makeRequest.mockResolvedValue({})
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ appendToUrl: "/g1/disconnect" }))
  })
})
