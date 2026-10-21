import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A Slack workspace read through Slack's API (chat item 2): a free or Pro
// team's export holds its public channels alone, so the import dialog can
// read with a token instead. The read runs on the server and shows in the
// import history, with how far it is, until it is planned there.

const readSlackWorkspace = vi.fn()
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  readSlackWorkspace: (...a: unknown[]) => readSlackWorkspace(...a),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { max_bytes: 5 * 1024 ** 3 } }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const { SlackImportUploadDialog, isSlackToken } = await import("./SlackImportUploadDialog")
const { JobRow } = await import("./SlackImportCard")
const { SLACK_READ_SCOPES, slackReadManifest } = await import("./slackTokenHelp")

afterEach(() => {
  cleanup()
  readSlackWorkspace.mockReset()
  toast.mockReset()
})

const TOKEN = "xoxp-1111-2222-3333-abcdef"

function openOnTheAPI() {
  const onReading = vi.fn()
  const onOpenChange = vi.fn()
  render(<SlackImportUploadDialog open onOpenChange={onOpenChange} onUploaded={() => {}} onReading={onReading} />)
  fireEvent.click(screen.getByRole("radio", { name: "Slack's API" }))
  return { onReading, onOpenChange }
}

describe("reading a Slack workspace through Slack's API", () => {
  it("starts the read with the token, hands the job to the history, and keeps the token nowhere", async () => {
    readSlackWorkspace.mockResolvedValue({ job_id: "job-9" })
    const { onReading, onOpenChange } = openOnTheAPI()
    expect(screen.getByRole("heading", { name: "Read a Slack workspace" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Slack workspace name"), { target: { value: "Acme" } })
    fireEvent.change(screen.getByLabelText("Slack token"), { target: { value: ` ${TOKEN} ` } })
    expect(screen.getByLabelText("Slack token").getAttribute("type")).toBe("password")
    fireEvent.click(screen.getByRole("button", { name: "Start the read" }))
    await waitFor(() => expect(onReading).toHaveBeenCalledWith("job-9"))
    expect(readSlackWorkspace).toHaveBeenCalledWith("Acme", TOKEN)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reading from Slack" }))
    // The dialog let the token go: back on the export, and an empty token on the API.
    expect(screen.getByRole("heading", { name: "Upload a Slack export" })).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Slack's API" }))
    expect((screen.getByLabelText("Slack token") as HTMLInputElement).value).toBe("")
  })

  it("says a token that isn't Slack's under its field, and asks nothing", () => {
    openOnTheAPI()
    fireEvent.change(screen.getByLabelText("Slack workspace name"), { target: { value: "Acme" } })
    fireEvent.change(screen.getByLabelText("Slack token"), { target: { value: "ghp_notslack" } })
    fireEvent.click(screen.getByRole("button", { name: "Start the read" }))
    expect(screen.getByText(/That isn't a Slack token/)).toBeTruthy()
    expect(screen.getByLabelText("Slack token").getAttribute("aria-invalid")).toBe("true")
    expect(readSlackWorkspace).not.toHaveBeenCalled()
  })

  it("says the server's refusal in place: a workspace with an import under way", async () => {
    readSlackWorkspace.mockRejectedValue({ response: { status: 409, data: { code: "active_job" } } })
    openOnTheAPI()
    fireEvent.change(screen.getByLabelText("Slack workspace name"), { target: { value: "Acme" } })
    fireEvent.change(screen.getByLabelText("Slack token"), { target: { value: TOKEN } })
    fireEvent.click(screen.getByRole("button", { name: "Start the read" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText(/Another import of this workspace is waiting or running/)).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
  })

  it("is offered where an export falls short: DMs and private channels", () => {
    render(<SlackImportUploadDialog open onOpenChange={() => {}} onUploaded={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "a read through Slack's API" }))
    expect(screen.getByRole("heading", { name: "Read a Slack workspace" })).toBeTruthy()
    expect(screen.getByLabelText("Slack token")).toBeTruthy()
  })

  it("asks Slack only to read, with people's emails to match them by", () => {
    const manifest = JSON.parse(slackReadManifest())
    expect(manifest.oauth_config.scopes.user).toEqual([...SLACK_READ_SCOPES])
    expect(SLACK_READ_SCOPES).toContain("users:read.email")
    expect(SLACK_READ_SCOPES.every((s) => /:(read|history)(\.email)?$/.test(s))).toBe(true)
    expect(isSlackToken(TOKEN)).toBe(true)
    expect(isSlackToken("xoxb-1-2-abcdefgh")).toBe(true)
    for (const t of ["", "xoxa-1-2-abcdefgh", "xoxp-", "ghp_abcdefgh", "xoxp-1 2"]) expect(isSlackToken(t)).toBe(false)
  })
})

describe("a read in the import history", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "job-9",
    slack_workspace_name: "Acme",
    source: "api",
    options: {},
    created_at: "2026-10-21T06:00:00Z",
    updated_at: "2026-10-21T06:05:00Z",
    chunks_total: 0,
    chunks_done: 0,
    chunks_failed: 0,
    items_imported: 0,
    errors_total: 0,
    ...over,
  })
  const handlers = { busy: false, onPlan: vi.fn(), onRun: () => {}, onCancel: () => {}, onRollback: () => {}, onDeleteZip: () => {}, onShowErrors: () => {}, onDiscard: vi.fn() }

  it("says how far it is while it reads, and can be stopped", () => {
    render(
      <JobRow
        job={row({ status: "pending", stage: "reading", progress: { read: { conversations: 12, of: 40, messages: 3100, replies: 110, files: 15 } } }) as never}
        {...handlers}
      />,
    )
    expect(screen.getByText("Reading")).toBeTruthy()
    expect(screen.getByText("through Slack's API")).toBeTruthy()
    expect(screen.getByText(/^Started /)).toBeTruthy()
    expect(screen.getByText("12 of 40 conversations")).toBeTruthy()
    expect(screen.getByText("3,210 messages")).toBeTruthy()
    expect(screen.getByText("15 files")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(handlers.onDiscard).toHaveBeenCalled()
  })

  it("is planned once it has read", () => {
    render(<JobRow job={row({ status: "validating", stage: "validating", progress: { read: { conversations: 40, of: 40, messages: 9000, replies: 400, files: 0 } } }) as never} {...handlers} />)
    expect(screen.getByText("40 conversations")).toBeTruthy()
    expect(screen.getByText("9,400 messages")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Plan" }))
    expect(handlers.onPlan).toHaveBeenCalled()
  })
})
