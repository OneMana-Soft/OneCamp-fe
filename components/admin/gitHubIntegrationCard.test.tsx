import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const { toast, makeRequest, axiosGet, fetched } = vi.hoisted(() => ({
  toast: vi.fn(),
  makeRequest: vi.fn(),
  axiosGet: vi.fn(),
  fetched: { current: {} as Record<string, unknown> },
}))

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({
    data: key ? fetched.current[key] : undefined,
    isLoading: false,
    isError: false,
    mutate: vi.fn(),
  }),
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: axiosGet, post: vi.fn() } }))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))

import GitHubIntegrationCard from "@/components/admin/GitHubIntegrationCard"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  fetched.current = {}
})

const link = {
  id: "l1",
  project_id: "p1",
  repo_owner: "acme",
  repo_name: "web",
  sync_issues: true,
  sync_prs: true,
  auto_create_tasks: false,
  default_task_status: "",
  created_at: "2026-10-01T00:00:00Z",
}

function given(connected: boolean, links: unknown[] = []) {
  fetched.current = {
    [GetEndpointUrl.GetGitHubStatus]: { status: { connected, linked_repos: links } },
    [GetEndpointUrl.GetUserProjectList]: { data: { user_projects: [{ project_uuid: "p1", project_name: "Website" }] } },
    [GetEndpointUrl.GetGitHubWebhookHealth]: { health: { completed_24h: 0, failed_24h: 0, processing_24h: 0 } },
  }
}

describe("the GitHub integration", () => {
  // "Please contact your system administrator", to the administrator, with
  // the credentials one button away.
  it("opens the credentials when GitHub isn't set up on this server, instead of a dead end", async () => {
    given(false)
    makeRequest.mockResolvedValue({ auth_url: "" })
    axiosGet.mockResolvedValue({ data: { data: { client_id: "", has_client_secret: false, has_webhook_secret: false, configured: false, source: "none" } } })
    render(<GitHubIntegrationCard />)
    fireEvent.click(screen.getByRole("button", { name: /Connect GitHub/ }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog.textContent).toMatch(/needs an OAuth app/)
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Not Configured" }))
  })

  it("offers Connect GitHub once, as an outline button under the plug", () => {
    given(false)
    const { container } = render(<GitHubIntegrationCard />)
    const connects = screen.getAllByRole("button", { name: /Connect GitHub/ })
    expect(connects).toHaveLength(1)
    expect(connects[0].className).not.toMatch(/\bbg-primary\b/)
    expect(container.querySelector("[data-empty-illustration]")).not.toBeNull()
  })

  // The card was a full-height scroll box between two sections that aren't.
  it("is a section like its neighbours, with no scroll box of its own", () => {
    given(true, [link])
    const { container } = render(<GitHubIntegrationCard />)
    expect(screen.getByRole("heading", { level: 2, name: "GitHub" })).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/overflow-y-auto|\bh-full\b/)
  })

  it("lists linked repositories as rows of one list, named in sentence case", () => {
    given(true, [link, { ...link, id: "l2", repo_name: "api" }])
    render(<GitHubIntegrationCard />)
    expect(screen.getByRole("heading", { name: "Linked repositories" })).toBeTruthy()
    const list = screen.getByRole("list", { name: "Linked repositories" })
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Import issues from acme/web" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Automation rules for acme/api" })).toBeTruthy()
    expect(screen.queryByText(/Import Issues|Link Repo\b|Linked Repositories/)).toBeNull()
  })

  // The poll ran on for up to three minutes after the card was gone.
  it("stops following an import once the card is gone", async () => {
    given(true, [link])
    makeRequest.mockResolvedValue({ job_id: "j1" })
    axiosGet.mockResolvedValue({ data: { job: { status: "running" } } })
    const { unmount } = render(<GitHubIntegrationCard />)
    fireEvent.click(screen.getByRole("button", { name: "Import issues from acme/web" }))
    await waitFor(() => expect(axiosGet).toHaveBeenCalledTimes(1))
    unmount()
    await act(() => new Promise((r) => setTimeout(r, 1700)))
    expect(axiosGet).toHaveBeenCalledTimes(1)
  })

  // A toast said "Project Required"; the project is asked for beside its picker.
  it("asks for a project beside its picker, and moves there", async () => {
    given(true, [])
    makeRequest.mockImplementation(async (o: { apiEndpoint: string }) =>
      o.apiEndpoint === GetEndpointUrl.GetGitHubRepos
        ? { repos: [{ full_name: "acme/site", owner: "acme", name: "site", description: "", private: false, html_url: "" }] }
        : undefined,
    )
    render(<GitHubIntegrationCard />)
    fireEvent.click(screen.getByRole("button", { name: /Link a repository/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Link acme/site" }))
    expect(await screen.findByText("Choose the project first.")).toBeTruthy()
    const project = screen.getByLabelText("Project")
    expect(project.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(project)
    expect(makeRequest).not.toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: PostEndpointUrl.GitHubLinkRepo }))
  })

  it("says the automation rules save as you pick them", async () => {
    given(true, [link])
    render(<GitHubIntegrationCard />)
    fireEvent.click(screen.getByRole("button", { name: "Automation rules for acme/web" }))
    const dialog = await screen.findByRole("dialog", { name: /Automation rules/ })
    expect(dialog.textContent).toMatch(/Changes save as you make them\./)
  })
})
