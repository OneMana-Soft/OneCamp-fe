import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: http.get, post: http.post } }))

import OAuthConfigCard from "./OAuthConfigCard"

afterEach(() => {
  cleanup()
  http.get.mockReset()
  http.post.mockReset()
  toast.mockReset()
})

// The server never sends a secret back; this is what it says of the Microsoft app (calendar B7).
const status = {
  google_client_id: "abc.apps.googleusercontent.com", google_has_client_secret: true, google_configured: true, google_source: "db",
  github_client_id: "", github_has_client_secret: false, github_configured: false, github_source: "none",
  microsoft_client_id: "6731de76-14a6-49ae-97bc-6eba6914391e", microsoft_has_client_secret: true, microsoft_configured: true, microsoft_source: "db",
}

// Calendar B7: the admin's Microsoft app sits beside Google's, and its secret is only ever "Saved".
describe("the admin's Microsoft app", () => {
  it("sits beside Google's, set up, with its id and a secret that only says Saved", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    render(<OAuthConfigCard />)
    // It isn't a way to sign in, so its card isn't named one.
    const card = await screen.findByLabelText("Microsoft app for Outlook Calendar")
    expect(screen.queryByLabelText("Microsoft sign-in")).toBeNull()
    const id = screen.getByLabelText("Client ID for Microsoft") as HTMLInputElement
    const secret = screen.getByLabelText("Client secret for Microsoft") as HTMLInputElement
    expect(id.value).toBe(status.microsoft_client_id)
    expect(secret.value).toBe("")
    expect(secret.type).toBe("password")
    expect(secret.placeholder).toBe("Saved")
    expect(card.textContent).toMatch(/Outlook Calendar/)
    expect(card.textContent).toMatch(/common/)
    expect(card.textContent).toMatch(/\/connector\/oauth\/callback/)
  })

  // DESIGN-BUILD-117 F1: the admin's steps sit on the card, beside the fields they end in, and the address copies.
  it("lays out the four steps on the card, with the redirect address and a Copy button", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://api.example.com/")
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<OAuthConfigCard />)
    const card = await screen.findByLabelText("Microsoft app for Outlook Calendar")
    const steps = card.querySelector("[data-outlook-how]") as HTMLElement
    expect(steps.querySelectorAll("li")).toHaveLength(4)
    expect(steps.textContent).toMatch(/Azure/)
    expect(steps.textContent).toMatch(/common/)
    expect(steps.textContent).toMatch(/Certificates & secrets/)
    const address = steps.querySelector("code")!.textContent!
    expect(address).toMatch(/\/connector\/oauth\/callback$/)
    fireEvent.click(within(card).getByRole("button", { name: "Copy redirect address" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address))
    // Only the Microsoft card carries steps.
    expect(document.querySelectorAll("[data-outlook-how]")).toHaveLength(1)
    vi.unstubAllEnvs()
  })

  it("sends only what changed, and the secret only when one is typed", async () => {
    http.get.mockResolvedValue({ data: { data: { ...status, microsoft_client_id: "", microsoft_has_client_secret: false, microsoft_configured: false, microsoft_source: "none" } } })
    http.post.mockResolvedValue({ data: { data: status } })
    render(<OAuthConfigCard />)
    const id = (await screen.findByLabelText("Client ID for Microsoft")) as HTMLInputElement
    expect((screen.getByLabelText("Client secret for Microsoft") as HTMLInputElement).placeholder).not.toBe("Saved")
    fireEvent.change(id, { target: { value: "app-id" } })
    fireEvent.change(screen.getByLabelText("Client secret for Microsoft"), { target: { value: "s3cret~value" } })
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1))
    expect(http.post.mock.calls[0][1]).toEqual({ microsoft_client_id: "app-id", microsoft_client_secret: "s3cret~value" })
    // Once saved, the page holds no secret: the field is empty again.
    await waitFor(() => expect((screen.getByLabelText("Client secret for Microsoft") as HTMLInputElement).value).toBe(""))
    expect(document.body.innerHTML).not.toContain("s3cret~value")
  })

  // CR-B22 L1: the Microsoft app isn't a sign-in, and what saving says names it as its card does.
  it("names the Microsoft app, not a sign-in, in what saving it says", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    http.post.mockRejectedValueOnce(new Error("502"))
    render(<OAuthConfigCard />)
    fireEvent.change(await screen.findByLabelText("Client ID for Microsoft"), { target: { value: "app-id" } })
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0].title).toBe("Couldn't save the Microsoft app for Outlook Calendar")
    http.post.mockResolvedValue({ data: { data: status } })
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2))
    expect(toast.mock.calls[1][0].title).toBe("Microsoft app for Outlook Calendar saved")
  })

  // DESIGN-BUILD-118 F3: the calendar's link lands on the Microsoft card itself, not on Google's at the top.
  it("gives each provider's card its own place to link to", async () => {
    http.get.mockResolvedValue({ data: { data: status } })
    render(<OAuthConfigCard />)
    const card = await screen.findByLabelText("Microsoft app for Outlook Calendar")
    expect(card.id).toBe("integrations-oauth-microsoft")
    expect(screen.getByLabelText("Google sign-in").id).toBe("integrations-oauth-google")
  })
})

