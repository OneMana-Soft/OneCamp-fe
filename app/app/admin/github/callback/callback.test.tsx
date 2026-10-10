import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The page GitHub sends an admin back to after they approve the app. It spoke
// in another voice ("GitHub Connected!", "Connection Failed", "Please wait"),
// on a raw grey tile with a spinner, and its way back was a text button to
// Admin's first tab rather than to Integrations, where the admin started.

const { params, push, post } = vi.hoisted(() => ({
  params: { current: new URLSearchParams() },
  push: vi.fn(),
  post: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.current,
  useRouter: () => ({ push }),
}))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: {} }))

import GitHubCallbackPage from "./page"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("the GitHub return page", () => {
  it("says, while it connects, what it is doing in the app's words, on the connections tile", () => {
    params.current = new URLSearchParams("code=abc&state=s1")
    post.mockReturnValue(new Promise(() => {}))
    render(<GitHubCallbackPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Connecting GitHub…" })).toBeTruthy()
    expect(screen.getByRole("status")).toBeTruthy()
    expect(document.querySelector(".hue-lake")).toBeTruthy()
    expect(document.querySelector(".bg-gray-900")).toBeNull()
    expect(document.body.textContent).not.toMatch(/Please/)
  })

  it("says it is connected in sentence case, and takes the admin back to Integrations", async () => {
    vi.useFakeTimers()
    params.current = new URLSearchParams("code=abc&state=s1")
    post.mockResolvedValue({ data: {} })
    render(<GitHubCallbackPage />)
    await act(async () => {})
    expect(screen.getByRole("heading", { level: 1, name: "GitHub is connected" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go back now" }).getAttribute("href")).toBe("/app/admin?tab=integrations")
    await act(async () => void vi.advanceTimersByTime(2000))
    expect(push).toHaveBeenCalledWith("/app/admin?tab=integrations")
    expect(document.body.textContent).not.toMatch(/!/)
  })

  it("says GitHub's own reason when it refused, with the way back to Integrations", () => {
    params.current = new URLSearchParams("error=access_denied&error_description=The+user+has+denied+your+application+access.")
    render(<GitHubCallbackPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Couldn't connect GitHub" })).toBeTruthy()
    expect(screen.getByText("The user has denied your application access.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to Integrations" }).getAttribute("href")).toBe("/app/admin?tab=integrations")
    expect(post).not.toHaveBeenCalled()
  })

  it("says what to do when GitHub sent no code back", () => {
    params.current = new URLSearchParams("")
    render(<GitHubCallbackPage />)
    expect(screen.getByText(/Start again from Admin, Integrations/)).toBeTruthy()
  })

  it("says the server's reason when the exchange fails, never a plea", async () => {
    params.current = new URLSearchParams("code=abc&state=s1")
    post.mockRejectedValue({ response: { status: 400, data: { msg: "This sign-in code has already been used." } } })
    render(<GitHubCallbackPage />)
    expect(await screen.findByText("This sign-in code has already been used.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Please/)
  })

  it("exchanges the code once, even when the effect runs twice", async () => {
    params.current = new URLSearchParams("code=abc&state=s1")
    post.mockResolvedValue({ data: {} })
    const { rerender } = render(<GitHubCallbackPage />)
    rerender(<GitHubCallbackPage />)
    await act(async () => {})
    expect(post).toHaveBeenCalledTimes(1)
  })
})
