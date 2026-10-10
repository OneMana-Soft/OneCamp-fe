import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const { toast, axiosGet, axiosPost } = vi.hoisted(() => ({ toast: vi.fn(), axiosGet: vi.fn(), axiosPost: vi.fn() }))

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: axiosGet, post: axiosPost } }))

import GitHubConfigDialog from "@/components/admin/GitHubConfigDialog"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const stored = { client_id: "Iv1.abc", has_client_secret: true, has_webhook_secret: false, configured: true, source: "db" }

describe("the GitHub credentials dialog", () => {
  // Labels sat above the inputs with nothing tying them, so a screen reader
  // announced three unnamed fields.
  it("names its three fields", async () => {
    axiosGet.mockResolvedValue({ data: { data: stored } })
    render(<GitHubConfigDialog open onOpenChange={() => {}} />)
    expect(await screen.findByLabelText("Client ID")).toBeTruthy()
    expect(screen.getByLabelText("Client secret").getAttribute("autocomplete")).toBe("new-password")
    expect(screen.getByLabelText("Webhook secret")).toBeTruthy()
    expect(screen.getByText(/Set up/)).toBeTruthy()
  })

  it("says the credentials couldn't be loaded, in place, with Try again", async () => {
    axiosGet.mockRejectedValueOnce(new Error("Network Error"))
    render(<GitHubConfigDialog open onOpenChange={() => {}} />)
    expect(await screen.findByText("Couldn't load the GitHub credentials.")).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
    axiosGet.mockResolvedValueOnce({ data: { data: stored } })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect((screen.getByLabelText("Client ID") as HTMLInputElement).value).toBe("Iv1.abc"))
  })

  // "Failed to save credentials" replaced the server's reason.
  it("keeps the server's reason when saving fails", async () => {
    axiosGet.mockResolvedValue({ data: { data: stored } })
    axiosPost.mockRejectedValue({ response: { data: { msg: "The demo is shared." } } })
    render(<GitHubConfigDialog open onOpenChange={() => {}} />)
    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: "Iv1.new" } })
    fireEvent.click(screen.getByRole("button", { name: "Save credentials" }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save the GitHub credentials", description: "The demo is shared." }),
      ),
    )
  })

  it("says why it opened, when Connect sent the admin here", async () => {
    axiosGet.mockResolvedValue({ data: { data: { ...stored, configured: false, client_id: "", source: "none" } } })
    render(<GitHubConfigDialog open onOpenChange={() => {}} reason="GitHub needs an OAuth app before it can connect." />)
    expect(await screen.findByText("GitHub needs an OAuth app before it can connect.")).toBeTruthy()
  })
})
