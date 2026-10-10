import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const state = { open: true, connections: [] as unknown[], error: undefined as unknown }
const mutate = vi.fn()
const makeRequest = vi.fn()

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: unknown) => C }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: state.error ? undefined : { data: state }, isLoading: false, isError: state.error, mutate }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import MyAssistantsCard from "@/components/ai/MyAssistantsCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.open = true
  state.connections = []
  state.error = undefined
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
    expect(tabs.slice(0, 3).map((t) => t.textContent)).toEqual(["ChatGPT", "Claude & Cowork", "Grok Bot"])
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

  // It was a bordered Card titled "Your AI assistants" again under the page's
  // h1 of the same name, at 18px with a bare icon.
  it("is flat sections under the page's title, with no card and no second title", () => {
    const { container } = render(<MyAssistantsCard />)
    expect(screen.queryByRole("heading", { name: "Your AI assistants" })).toBeNull()
    expect(container.querySelector(".rounded-xl.border")).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Connect an assistant" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Connected" })).toBeTruthy()
  })

  // A failed read said the admin hadn't let assistants in, and "Nothing yet":
  // two false things, and no way to try again.
  it("says it couldn't load, with Try again, before saying anything about the workspace or the list", () => {
    state.error = { response: { status: 503, data: { msg: "The assistants could not be read." } } }
    render(<MyAssistantsCard />)
    expect(screen.getByText("Couldn't load your AI assistants")).toBeTruthy()
    expect(screen.getByText("The assistants could not be read.")).toBeTruthy()
    expect(screen.queryByText(/has not let outside assistants/)).toBeNull()
    expect(screen.queryByText(/Nothing/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  // The promises' icons were orange, the colour of the one action.
  it("draws the promises on the section's tiles, nothing in orange, no box around each", () => {
    const { container } = render(<MyAssistantsCard />)
    expect(container.querySelector("svg.text-primary")).toBeNull()
    const promise = screen.getByText("It acts as you").closest("li") as HTMLElement
    expect(promise.className).not.toMatch(/\bborder\b/)
    expect(promise.querySelector(".hue-sky")).toBeTruthy()
  })

  it("says nothing is connected as the empty state on the section's tile, inside the list's box", () => {
    render(<MyAssistantsCard />)
    const none = screen.getByText("Nothing connected yet")
    expect(none.closest(".rounded-lg.border")).toBeTruthy()
  })
})
