import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const api = vi.hoisted(() => ({ copyPublishedPage: vi.fn(), unlockPage: vi.fn() }))
vi.mock("@/lib/publish/publish", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }))
const refresh = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock("@/lib/auth/sessionRefresh", async (importOriginal) => ({ ...(await importOriginal<object>()), ...refresh }))

const { PublishedRoute, go, modeOf } = await import("@/components/publish/PublishedRoute")

const at = (search: string) => window.history.replaceState(null, "", `/p/launch-notes${search}`)
const unauthorised = () => Object.assign(new Error("401"), { isAxiosError: true, response: { status: 401, data: { msg: "Sign in again." } } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  api.copyPublishedPage.mockReset()
  api.unlockPage.mockReset()
  refresh.refreshSession.mockReset()
  window.history.replaceState(null, "", "/")
})

describe("the web's /p/<slug>", () => {
  it("reads what the address asks for", () => {
    expect(modeOf("")).toEqual({ kind: "go" })
    expect(modeOf("?unlock=1")).toEqual({ kind: "unlock" })
    expect(modeOf("?copy=1&k=3.99.sig")).toEqual({ kind: "copy", k: "3.99.sig" })
  })

  it("sends the browser to the page itself", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    at("")
    render(<PublishedRoute slug="launch-notes" />)
    await waitFor(() => expect(to).toHaveBeenCalledWith(expect.stringMatching(/\/public\/p\/launch-notes$/)))
  })

  it("opens a password page with its unlock, and says when the password is wrong", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    at("?unlock=1")
    api.unlockPage.mockResolvedValueOnce({ ok: false, status: 401, msg: "That password doesn't open this page." })
    api.unlockPage.mockResolvedValueOnce({ ok: true, data: { token: "3.99.sig", url: "https://api.example.test/public/p/launch-notes?k=3.99.sig", expires_in: 43200 } })
    render(<PublishedRoute slug="launch-notes" />)
    const field = (await screen.findByLabelText("Password")) as HTMLInputElement
    // Its lock is a neutral tile: a password names no area of the app.
    const tile = document.querySelector("[data-unlock-tile]")!
    expect(tile.className).toContain("bg-sunken")
    expect(tile.className).not.toMatch(/hue/)
    // Its eye shows the password typed, and hides it again.
    expect(field.type).toBe("password")
    fireEvent.click(screen.getByRole("button", { name: "Show the password" }))
    expect(field.type).toBe("text")
    fireEvent.click(screen.getByRole("button", { name: "Hide the password" }))
    expect(field.type).toBe("password")
    expect((screen.getByRole("button", { name: "Open the page" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field, { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: "Open the page" }))
    await screen.findByText("That password doesn't open this page.")
    expect(to).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: "open sesame" } })
    fireEvent.click(screen.getByRole("button", { name: "Open the page" }))
    await waitFor(() => expect(to).toHaveBeenCalledWith("https://api.example.test/public/p/launch-notes?k=3.99.sig"))
    expect(api.unlockPage).toHaveBeenLastCalledWith({ slug: "launch-notes" }, "open sesame")
  })

  it("copies a page once, even mounted twice, and opens the copy", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    at("?copy=1&k=3.99.sig")
    api.copyPublishedPage.mockResolvedValue("copy-1")
    render(
      <StrictMode>
        <PublishedRoute slug="launch-notes" />
      </StrictMode>,
    )
    await waitFor(() => expect(to).toHaveBeenCalledWith("/app/doc/copy-1"))
    expect(api.copyPublishedPage).toHaveBeenCalledTimes(1)
    expect(api.copyPublishedPage).toHaveBeenCalledWith({ slug: "launch-notes" }, "3.99.sig")
  })

  it("renews a member's session once, and asks a visitor with none to sign in", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    at("?copy=1")
    api.copyPublishedPage.mockRejectedValueOnce(unauthorised()).mockResolvedValueOnce("copy-2")
    refresh.refreshSession.mockResolvedValue(undefined)
    render(<PublishedRoute slug="launch-notes" />)
    await waitFor(() => expect(to).toHaveBeenCalledWith("/app/doc/copy-2"))
    cleanup()

    api.copyPublishedPage.mockRejectedValue(unauthorised())
    refresh.refreshSession.mockRejectedValue(unauthorised())
    render(<PublishedRoute slug="launch-notes" />)
    await screen.findByText("Sign in to copy this page")
    expect(screen.getByRole("link", { name: "Back to the page" }).getAttribute("href")).toMatch(/\/public\/p\/launch-notes$/)
  })
})
