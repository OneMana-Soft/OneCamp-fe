import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const api = vi.hoisted(() => ({ copyPublishedPage: vi.fn(), unlockPage: vi.fn(), pageState: vi.fn() }))
vi.mock("@/lib/publish/publish", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }))
const refresh = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock("@/lib/auth/sessionRefresh", async (importOriginal) => ({ ...(await importOriginal<object>()), ...refresh }))

const { PublishedRoute, modeOf } = await import("@/components/publish/PublishedRoute")
const { go } = await import("@/components/publish/publishCards")
const { takeAfterSignIn } = await import("@/lib/afterSignIn")

const at = (search: string) => window.history.replaceState(null, "", `/p/launch-notes${search}`)
const unauthorised = () => Object.assign(new Error("401"), { isAxiosError: true, response: { status: 401, data: { msg: "Sign in again." } } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  api.copyPublishedPage.mockReset()
  api.unlockPage.mockReset()
  api.pageState.mockReset()
  refresh.refreshSession.mockReset()
  window.history.replaceState(null, "", "/")
  sessionStorage.clear()
})

describe("the web's /p/<slug>", () => {
  it("reads what the address asks for", () => {
    expect(modeOf("")).toEqual({ kind: "go" })
    expect(modeOf("?unlock=1")).toEqual({ kind: "unlock" })
    expect(modeOf("?copy=1&k=3.99.sig")).toEqual({ kind: "copy", k: "3.99.sig" })
  })

  it("sends the browser to a live page itself, asking first", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    api.pageState.mockResolvedValue({ ok: true, data: { state: "live" } })
    at("")
    render(<PublishedRoute slug="launch-notes" />)
    await waitFor(() => expect(to).toHaveBeenCalledWith(expect.stringMatching(/\/public\/p\/launch-notes$/)))
    expect(api.pageState).toHaveBeenCalledWith("launch-notes")
  })

  it("shows every other state here, in the page's frame, with the page's words", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    for (const [state, words] of [
      ["missing", "There's no page here"],
      ["gone", "This page has expired"],
    ] as const) {
      api.pageState.mockResolvedValueOnce({ ok: true, data: { state } })
      at("")
      render(<PublishedRoute slug="launch-notes" />)
      await screen.findByRole("heading", { name: words })
      expect(document.querySelector("[data-publish-tile]")?.className).toContain("hue-ink")
      if (state === "gone") expect(document.querySelector("[data-publish-tile] svg")?.getAttribute("class")).toMatch(/lucide-calendar-off/)
      expect(document.querySelector("[data-guest-band]")).toBeNull()
      expect(screen.getByText(/Made with OneCamp/)).toBeTruthy()
      cleanup()
    }
    api.pageState.mockResolvedValueOnce({ ok: false, status: 429, msg: "busy" })
    at("")
    render(<PublishedRoute slug="launch-notes" />)
    await screen.findByRole("heading", { name: "This page is busy" })
    expect(to).not.toHaveBeenCalled()
    // Busy is a wait (a clock); an expired page has its own mark.
    expect(document.querySelector("[data-publish-tile] svg")?.getAttribute("class")).toMatch(/lucide-clock/)
    // Try again loads the page again, which asks the address again.
    const again = vi.spyOn(go, "again").mockImplementation(() => {})
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(again).toHaveBeenCalledTimes(1)
  })

  it("asks a password page's password at once", async () => {
    api.pageState.mockResolvedValue({ ok: true, data: { state: "locked" } })
    at("")
    render(<PublishedRoute slug="launch-notes" />)
    await screen.findByRole("heading", { name: "This page needs a password" })
  })

  it("goes to the page when it can't ask, which says the same in its own frame", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    api.pageState.mockResolvedValue({ ok: false, status: 0, msg: "offline" })
    at("")
    render(<PublishedRoute slug="launch-notes" />)
    await waitFor(() => expect(to).toHaveBeenCalled())
  })

  it("opens a password page with its unlock, and says when the password is wrong", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    at("?unlock=1")
    api.unlockPage.mockResolvedValueOnce({ ok: false, status: 401, msg: "That password doesn't open this page." })
    api.unlockPage.mockResolvedValueOnce({ ok: true, data: { token: "3.99.sig", url: "https://api.example.test/public/p/launch-notes?k=3.99.sig", expires_in: 43200 } })
    render(<PublishedRoute slug="launch-notes" />)
    const field = (await screen.findByLabelText("Password")) as HTMLInputElement
    // Its lock is the one a room's passcode shows (SecretCard's LockTile): neutral, as a password names no area of the app.
    expect(document.querySelector("[data-unlock-tile] svg")?.getAttribute("class")).toMatch(/lucide-lock/)
    expect(document.querySelector("[data-publish-tile]")).toBeNull()
    expect(document.querySelector("[data-guest-band]")).toBeNull()
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

  it("carries the copy on after the visitor signs in", async () => {
    at("?copy=1&k=3.99.sig")
    api.copyPublishedPage.mockRejectedValue(unauthorised())
    refresh.refreshSession.mockRejectedValue(unauthorised())
    render(<PublishedRoute slug="launch-notes" />)
    await screen.findByText("Sign in to copy this page")
    expect(screen.getByText(/Sign in, and the copy carries on from here/)).toBeTruthy()
    expect(takeAfterSignIn()).toBeNull()
    const toSignIn = vi.spyOn(go, "signIn").mockImplementation(() => {})
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(toSignIn).toHaveBeenCalled())
    expect(takeAfterSignIn()).toBe("/p/launch-notes?copy=1&k=3.99.sig")
  })
})
