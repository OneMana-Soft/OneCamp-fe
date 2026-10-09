import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// An allow-list entry can name a whole domain (@example.com), and the admin is
// told so, and warned off public ones.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getWorkspaceSettings: async () => ({ upload_limit_mb: 10, upload_limit_source: "default", allowed_users: ["@acme.example"], allowed_users_source: "db" }),
  updateWorkspaceSettings: vi.fn(),
}))

const { default: WorkspaceSettingsCard } = await import("./WorkspaceSettingsCard")

afterEach(cleanup)

describe("the allow-list", () => {
  it("explains a domain entry, and warns against a public one", async () => {
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Allowed emails and domains/)) as HTMLTextAreaElement
    await screen.findByDisplayValue("@acme.example")
    const help = document.getElementById(list.getAttribute("aria-describedby") ?? "")
    expect(help?.textContent).toMatch(/@example\.com lets in anyone whose Google or GitHub account has a verified address at\s+example\.com/)
    expect(help?.textContent).toMatch(/public domain like @gmail\.com/)
  })
})
