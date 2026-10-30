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
  importSignInURL: vi.fn(async () => {
    if (refusal) throw refusal
    return "https://launchpad.37signals.com/authorization/new?state=s"
  }),
}))
const goTo = vi.fn()
vi.mock("@/lib/navigate", () => ({ leaveTo: (url: string) => goTo(url) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const { ImportConnectDialog } = await import("./ImportConnectDialog")

afterEach(() => {
  cleanup()
  sent.length = 0
  refusal = null
  toast.mockReset()
  goTo.mockReset()
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

describe("what a connection is missing", () => {
  // Each missing field was a red toast ("Token required", "Atlassian site URL
  // required…"), away from the field and gone in five seconds.
  it("says it under the field, takes the cursor there, and sends nothing", () => {
    render(<ImportConnectDialog provider="jira" open onOpenChange={() => {}} onConnected={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    const site = screen.getByLabelText(/Atlassian site URL/)
    expect(site.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("Enter your Atlassian site's address, like https://acme.atlassian.net.")).toBeTruthy()
    expect(screen.getByText("Enter the email you sign in to Jira with.")).toBeTruthy()
    expect(screen.getByText("Paste the Jira API token.")).toBeTruthy()
    expect(document.activeElement).toBe(site)
    expect(sent).toHaveLength(0)
    expect(toast).not.toHaveBeenCalled()
  })

  it("lets a field's message go once it is filled", () => {
    render(<ImportConnectDialog provider="asana" open onOpenChange={() => {}} onConnected={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    expect(screen.getByText("Paste the access token.")).toBeTruthy()
    fill(/Access token/, "1/123:abc")
    expect(screen.queryByText("Paste the access token.")).toBeNull()
  })
})

// basecamp-46: Basecamp has no tokens to paste, so the admin signs in at it
// and comes back to the import page.
describe("connecting a provider by signing in", () => {
  it("sends the admin to the provider's sign-in, asking for no token", async () => {
    render(<ImportConnectDialog provider="basecamp" signIn={{ configured: true }} open onOpenChange={() => {}} onConnected={() => {}} />)
    expect(screen.queryByLabelText(/Access token/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Continue to Basecamp" }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("https://launchpad.37signals.com/authorization/new?state=s"))
  })

  // The server's own sentence, once, its settings set as code and its address
  // a link out (DESIGN-BUILD-2, 20 Oct; components/ui/setupSentence).
  it("says how to set it up on a server without the provider's app, and offers no sign-in", () => {
    const setup = "Register an app at launchpad.37signals.com/integrations, then set BASECAMP_OAUTH_CLIENT_ID."
    render(<ImportConnectDialog provider="basecamp" signIn={{ configured: false, setup }} open onOpenChange={() => {}} onConnected={() => {}} />)
    expect(screen.getByRole("dialog").textContent).toContain(setup)
    const link = screen.getByRole("link", { name: "launchpad.37signals.com/integrations" })
    expect(link.getAttribute("href")).toBe("https://launchpad.37signals.com/integrations")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(screen.getByText("BASECAMP_OAUTH_CLIENT_ID").tagName).toBe("CODE")
    expect(screen.queryByRole("button", { name: "Continue to Basecamp" })).toBeNull()
  })

  it("says why the sign-in couldn't start, in the dialog", async () => {
    refusal = { response: { status: 503, data: { code: "provider_error", error: "Couldn't start signing in to Basecamp. Try again." } } }
    render(<ImportConnectDialog provider="basecamp" signIn={{ configured: true }} open onOpenChange={() => {}} onConnected={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue to Basecamp" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't start signing in to Basecamp. Try again."))
    expect(goTo).not.toHaveBeenCalled()
  })
})
