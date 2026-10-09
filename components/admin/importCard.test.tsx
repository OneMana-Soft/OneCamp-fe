import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The card's data: one provider (Jira), connected, and its jobs.
let jobs: unknown[] = []
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (url === "/admin/import/providers") return { data: { providers: [{ name: "jira", sources: ["api"], capabilities: [], default_status_map: {}, default_priority_map: {} }] }, mutate: vi.fn() }
    if (url === "/admin/import/connections") return { data: { connections: [{ provider: "jira", created_at: "", updated_at: "1" }] }, mutate: vi.fn() }
    if (url.startsWith("/admin/import/jobs")) return { data: { jobs }, mutate: vi.fn() }
    return { data: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
let discover: () => Promise<unknown> = async () => []
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  discoverImportResources: vi.fn(() => discover()),
}))
vi.mock("@/components/admin/ImportConnectDialog", () => ({
  ImportConnectDialog: ({ open }: { open: boolean }) => (open ? <p>connect dialog open</p> : null),
}))

const ImportCard = (await import("./ImportCard")).default

afterEach(() => {
  cleanup()
  asked.length = 0
  jobs = []
})

describe("the import card", () => {
  // The workspace list used to swallow its failure, so a refused token
  // looked like an account with nothing to import.
  it("says why the list couldn't load, and offers to reconnect", async () => {
    discover = async () => {
      throw { response: { status: 400, data: { code: "token_rejected", error: "Jira didn't accept that email and API token." } } }
    }
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("button", { name: "Jira" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Jira didn't accept that email and API token\./))
    fireEvent.click(screen.getByRole("button", { name: /Reconnect/ }))
    await waitFor(() => expect(screen.getByText("connect dialog open")).toBeTruthy())
  })

  it("can try the list again after a failure it can't fix itself", async () => {
    let calls = 0
    discover = async () => {
      calls++
      if (calls === 1) throw { response: { status: 503, data: { code: "unreachable", error: "Couldn't reach https://acme.atlassian.net." } } }
      return [{ id: "ENG", name: "Engineering", kind: "project" }]
    }
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("button", { name: "Jira" }))
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByRole("button", { name: /Reconnect/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByRole("option", { name: "Engineering" })).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("the import card before a provider is picked", () => {
  // Jobs were listed only once a provider was picked, so an admin coming
  // back couldn't see how their imports were doing.
  it("lists every provider's imports, Slack's left to their own card", () => {
    discover = async () => []
    jobs = [
      { id: "a", provider: "jira", source_workspace_name: "Acme", source: "api", status: "running", stage: "tasks", options: {}, created_at: new Date().toISOString(), updated_at: "", chunks_total: 2, chunks_done: 1, chunks_failed: 0, items_imported: 40, errors_total: 0 },
      { id: "b", provider: "slack", source_workspace_name: "Acme Slack", source: "export_zip", status: "completed", options: {}, created_at: new Date().toISOString(), updated_at: "", chunks_total: 1, chunks_done: 1, chunks_failed: 0, items_imported: 9, errors_total: 0 },
    ]
    render(<ImportCard />)
    expect(asked).toContain("/admin/import/jobs")
    expect(screen.getByText(/Jira ·/)).toBeTruthy()
    expect(screen.getByText("Acme")).toBeTruthy()
    expect(screen.queryByText("Acme Slack")).toBeNull()
  })
})
