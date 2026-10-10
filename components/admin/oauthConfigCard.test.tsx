import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Google and GitHub sign-in credentials. A failed load left the fields empty
// and the providers looking unset; it now says so, with Try again. Each field
// is named by its label, the secrets are fields a browser never fills with
// the admin's own password, the status reads as words beside a quiet label
// (no pill), and edits wait in one save bar that sends only what changed.

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: http.get, post: http.post }, OWN_ERRORS: { suppressErrorToast: true } }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))

const { default: OAuthConfigCard } = await import("./OAuthConfigCard")

const status = {
  google_client_id: "123.apps.googleusercontent.com",
  google_has_client_secret: true,
  google_configured: true,
  google_source: "db",
  github_client_id: "",
  github_has_client_secret: false,
  github_configured: false,
  github_source: "none",
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  http.get.mockReset()
  http.post.mockReset()
})

describe("sign-in providers", () => {
  it("says it couldn't load, with no fields to guess at, and tries again", async () => {
    http.get.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ data: { data: status } })
    render(<OAuthConfigCard />)
    expect(await screen.findByText("Couldn't load the sign-in providers")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByDisplayValue("123.apps.googleusercontent.com")).toBeTruthy()
  })

  it("names every field, and keeps a browser from filling the secrets", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    render(<OAuthConfigCard />)
    expect(await screen.findByLabelText("Client ID for Google")).toBeTruthy()
    expect(screen.getByLabelText("Client ID for GitHub")).toBeTruthy()
    for (const name of ["Client secret for Google", "Client secret for GitHub"]) {
      const field = screen.getByLabelText(name)
      expect(field.getAttribute("autocomplete")).toBe("new-password")
      expect(field.getAttribute("name")).toBeTruthy()
    }
  })

  it("reads each provider's status as words, not a pill with an icon", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    render(<OAuthConfigCard />)
    const on = await screen.findByText("Set up")
    expect(on.className).toMatch(/text-success-ink/)
    expect(on.querySelector("svg")).toBeNull()
    expect(screen.getByText("Not set up")).toBeTruthy()
  })

  it("holds edits in one save bar, and sends only the provider that changed", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    http.post.mockResolvedValue({ data: {} })
    render(<OAuthConfigCard />)
    fireEvent.change(await screen.findByLabelText("Client ID for GitHub"), { target: { value: "Iv1.abc" } })
    const bar = screen.getByRole("region", { name: "Unsaved changes" })
    await act(async () => void fireEvent.click(within(bar).getByRole("button", { name: "Save" })))
    expect(http.post).toHaveBeenCalledTimes(1)
    expect(http.post.mock.calls[0][1]).toEqual({ github_client_id: "Iv1.abc" })
  })
})
