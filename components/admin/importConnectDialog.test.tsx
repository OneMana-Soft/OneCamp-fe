import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let refusal: unknown = null
const sent: unknown[] = []
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  connectImport: vi.fn(async (_p: string, input: unknown) => {
    sent.push(input)
    if (refusal) throw refusal
  }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ImportConnectDialog } = await import("./ImportConnectDialog")

afterEach(() => {
  cleanup()
  sent.length = 0
  refusal = null
})

const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe("connecting a provider", () => {
  // The token is tested before it is saved, and what is wrong with it stays
  // in the dialog, by the fields it is about.
  it("says what the provider made of the token, and stays open to fix it", async () => {
    refusal = { response: { status: 400, data: { code: "token_rejected", error: "Jira didn't accept that email and API token. Use a classic API token." } } }
    const onConnected = vi.fn()
    const onOpenChange = vi.fn()
    render(<ImportConnectDialog provider="jira" open onOpenChange={onOpenChange} onConnected={onConnected} />)
    fill(/Atlassian site URL/, "https://acme.atlassian.net")
    fill(/Atlassian account email/, "ada@acme.com")
    fill(/API token/, "scoped-token")
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Jira didn't accept that email and API token. Use a classic API token."))
    expect(onConnected).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    refusal = null
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(sent[1]).toMatchObject({ access_token: "scoped-token", metadata: { email: "ada@acme.com", site_url: "https://acme.atlassian.net" } })
  })
})
