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
    render(<MyAssistantsCard withTitle={false} />)
    expect(screen.getByText(/has not let outside assistants into this workspace/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Connect an assistant/ })).toBeNull()
  })

  // Design v3 (admin §S6): Connect opens a dialog of three option cards; the
  // chosen one is ringed in the accent and lifts; then the MCP address with a
  // big copy and the chosen assistant's steps, numbered.
  it("connects through three option cards, the address and three numbered steps", () => {
    render(<MyAssistantsCard withTitle={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Connect an assistant/ }))
    const options = screen.getAllByRole("radio")
    expect(options.map((o) => o.textContent?.slice(1))).toEqual(["ChatGPT", "Claude & Cowork", "Grok Bot"])
    expect(options[0].getAttribute("aria-checked")).toBe("true")
    expect(options[0].className).toContain("assistant-option")
    fireEvent.click(screen.getByRole("radio", { name: /Claude & Cowork/ }))
    expect(screen.getByRole("radio", { name: /Claude & Cowork/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("button", { name: /MCP address/i })).toBeTruthy()
    const steps = document.querySelectorAll("[data-connect-steps] li")
    expect(steps.length).toBe(3)
    expect(steps[0].querySelector(".assistant-step-num")?.textContent).toBe("1")
    expect(steps[0].textContent).toMatch(/Connectors/)
  })

  it("lists a connection and ends it only after it is confirmed", async () => {
    state.connections = [
      { id: "g1", client_name: "ChatGPT", agent_id: "a1", agent_name: "Priya's ChatGPT", scopes: ["tasks:read"], created_at: new Date().toISOString() },
    ]
    render(<MyAssistantsCard withTitle={false} />)
    expect(screen.getByText(/acting as Priya's ChatGPT/)).toBeTruthy()
    expect(screen.getByText(/not used yet/)).toBeTruthy()

    // Disconnect waits in the card's ⋯ menu.
    fireEvent.keyDown(screen.getByRole("button", { name: "More for ChatGPT" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Disconnect/ }))
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
    const { container } = render(<MyAssistantsCard withTitle={false} />)
    expect(screen.queryByRole("heading", { name: "Your AI assistants" })).toBeNull()
    expect(container.querySelector(".rounded-xl.border")).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Connected" })).toBeTruthy()
  })

  // A failed read said the admin hadn't let assistants in, and "Nothing yet":
  // two false things, and no way to try again.
  it("says it couldn't load, with Try again, before saying anything about the workspace or the list", () => {
    state.error = { response: { status: 503, data: { msg: "The assistants could not be read." } } }
    render(<MyAssistantsCard withTitle={false} />)
    expect(screen.getByText("Couldn't load your AI assistants")).toBeTruthy()
    expect(screen.getByText("The assistants could not be read.")).toBeTruthy()
    expect(screen.queryByText(/has not let outside assistants/)).toBeNull()
    expect(screen.queryByText(/Nothing/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  // The promises' icons were orange, then on tinted tiles; hue is for
  // identity (admin §1.5), so they are one note with ink-3 shields.
  it("says the promises on one sunken note, nothing in orange or tinted", () => {
    const { container } = render(<MyAssistantsCard withTitle={false} />)
    expect(container.querySelector("svg.text-primary")).toBeNull()
    const note = container.querySelector("[data-assistant-promises]") as HTMLElement
    expect(note.className).toContain("ai-sunken-note")
    expect(note.querySelector("[class*='hue-']")).toBeNull()
  })

  it("stands empty on the plug spot, with Connect, inside a card", () => {
    const { container } = render(<MyAssistantsCard withTitle={false} />)
    const none = screen.getByText("Nothing connected yet")
    expect(none.closest("[data-settings-card]")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration] [data-spot]")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Connect an assistant/ })).toBeTruthy()
  })

  it("draws each connection as a card: its mark, its name, when it connected and what it last did", () => {
    state.connections = [
      { id: "g1", client_name: "Claude", agent_id: "a1", agent_name: "Priya Raman", scopes: [], created_at: "2026-10-01T10:00:00Z" },
    ]
    const { container } = render(<MyAssistantsCard withTitle={false} />)
    const card = container.querySelector("[data-assistant-card]") as HTMLElement
    expect(card.className).toContain("set-card")
    expect(card.querySelector("[data-assistant-mark]")?.textContent).toBe("C")
    expect(card.textContent).toMatch(/Connected 1 Oct/)
  })
})
