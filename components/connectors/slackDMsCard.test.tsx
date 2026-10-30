import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { pinTestClock } from "@/lib/testing/testClock"
import type { SlackImportJob } from "@/services/slackImportService"
import type { MySlackReads } from "./mySlackDMs"

pinTestClock()

// Bring your Slack DMs (chat item 2): each member brings their own DMs, group
// DMs and private channels into the team's Slack import, with their own token,
// from Settings. The card says plainly what comes across and who can see it,
// follows the read until it is in, and keeps the token nowhere.

const getMySlackReads = vi.fn<() => Promise<MySlackReads>>()
const bringMySlackDMs = vi.fn()
const stopMySlackRead = vi.fn()
const getMySlackReadNotes = vi.fn()
vi.mock("./mySlackDMs", async (orig) => ({
  ...(await orig<typeof import("./mySlackDMs")>()),
  getMySlackReads: () => getMySlackReads(),
  bringMySlackDMs: (...a: unknown[]) => bringMySlackDMs(...a),
  stopMySlackRead: (...a: unknown[]) => stopMySlackRead(...a),
  getMySlackReadNotes: (...a: unknown[]) => getMySlackReadNotes(...a),
}))
let demoVisitor = false
vi.mock("@/hooks/useDemoVisitor", () => ({ useDemoVisitor: () => demoVisitor }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => (o: { onConfirm: () => unknown }) => void o.onConfirm(),
}))

const { default: SlackDMsCard, conversationsLine, memberTokenProblem, underWayLine } = await import("./SlackDMsCard")
const { DM_READ_APP, slackReadManifest } = await import("@/components/admin/slackTokenHelp")
const { slackJobLive, slackJobState } = await import("@/services/slackImportService")

afterEach(() => {
  cleanup()
  getMySlackReads.mockReset()
  bringMySlackDMs.mockReset()
  stopMySlackRead.mockReset()
  getMySlackReadNotes.mockReset()
  toast.mockReset()
  demoVisitor = false
})

const TOKEN = "xoxp-1111-2222-3333-abcdef"

function job(over: Partial<SlackImportJob>): SlackImportJob {
  return {
    id: "read-1",
    slack_workspace_name: "Acme",
    source: "api",
    status: "pending",
    stage: "reading",
    options: { member_dms: true },
    created_at: "2026-10-21T09:00:00Z",
    updated_at: "2026-10-21T09:05:00Z",
    chunks_total: 0,
    chunks_done: 0,
    chunks_failed: 0,
    items_imported: 0,
    errors_total: 0,
    ...over,
  }
}

async function show(reads: SlackImportJob[], teamImported = true) {
  getMySlackReads.mockResolvedValue({ reads, team_imported: teamImported })
  const view = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SlackDMsCard />
    </SWRConfig>,
  )
  await act(async () => {})
  return view
}

describe("bringing your Slack DMs", () => {
  it("shows nothing until the team has imported Slack, and nothing to the demo's visitor", async () => {
    const { container } = await show([], false)
    expect(container.textContent).toBe("")
    cleanup()
    demoVisitor = true
    const demo = await show([], true)
    expect(demo.container.textContent).toBe("")
    expect(getMySlackReads).toHaveBeenCalledTimes(1)
  })

  it("says plainly what comes across and who sees it, and starts a read with the member's own token", async () => {
    await show([])
    expect(screen.getByRole("heading", { name: "Your Slack DMs" })).toBeTruthy()
    expect(screen.getByText("Not brought yet")).toBeTruthy()
    const card = screen.getByRole("region", { name: "Your Slack DMs" })
    expect(card.textContent).toContain("The other people's messages in them come across too")
    expect(card.textContent).toContain("only the people in it can see it")

    fireEvent.click(screen.getByRole("button", { name: "Bring my DMs" }))
    const field = screen.getByLabelText("Your Slack user token")
    expect(field.getAttribute("type")).toBe("password")
    // Before any token is asked for, the form says it all, unfolded.
    const form = field.closest("form")!
    expect(form.textContent).toContain("The other people's messages in them come across too")
    expect(form.querySelector("details")?.textContent ?? "").not.toContain("The other people's messages")
    expect(card.textContent).toContain("Your admins see that you brought your DMs, and how many conversations. Never what's in them.")

    bringMySlackDMs.mockResolvedValue({ job_id: "read-1" })
    getMySlackReads.mockResolvedValue({ reads: [job({})], team_imported: true })
    fireEvent.change(field, { target: { value: ` ${TOKEN} ` } })
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    await waitFor(() => expect(bringMySlackDMs).toHaveBeenCalledWith(TOKEN))
    expect(await screen.findByText("Reading")).toBeTruthy()
    expect(screen.queryByLabelText("Your Slack user token")).toBeNull()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reading your DMs from Slack" }))
  })

  it("says what's wrong with a token before sending it, and the server's refusal in place", async () => {
    await show([])
    fireEvent.click(screen.getByRole("button", { name: "Bring my DMs" }))
    const field = () => screen.getByLabelText("Your Slack user token")
    const start = () => fireEvent.click(screen.getByRole("button", { name: "Start" }))

    fireEvent.change(field(), { target: { value: "xoxb-1111-2222-abcdef" } })
    start()
    expect(screen.getByText(/A bot token reads only the channels its app was added to/)).toBeTruthy()
    expect(field().getAttribute("aria-invalid")).toBe("true")
    expect(bringMySlackDMs).not.toHaveBeenCalled()

    bringMySlackDMs.mockRejectedValueOnce({
      response: { status: 403, data: { code: "not_your_token", msg: "That token is someone else's. Use your own: it reads only your DMs." } },
    })
    fireEvent.change(field(), { target: { value: TOKEN } })
    start()
    expect(await screen.findByText("That token is someone else's. Use your own: it reads only your DMs.")).toBeTruthy()

    bringMySlackDMs.mockRejectedValueOnce({ response: { status: 429, data: {} } })
    start()
    expect(await screen.findByText("That's three tries in a minute. Wait a minute, then try again.")).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
  })

  it("follows a read: how far it is, why it waits, and a way to stop it", async () => {
    await show([job({ progress: { read: { conversations: 3, of: 12, messages: 40, replies: 2, files: 0 } } })])
    expect(screen.getByText("Reading from Slack: 3 of 12 conversations.")).toBeTruthy()
    // Where it stands leads; what it brings follows, in one line.
    const note = document.querySelector("[data-slack-dms]")!
    expect(note.firstElementChild?.hasAttribute("data-slack-dms-progress")).toBe(true)
    expect(screen.getByText("Your DMs, group DMs and private channels, each private to its people")).toBeTruthy()
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("25")
    // Sized as a flex item: an inline span of no content would have no width.
    expect(bar.parentElement?.className).toContain("flex")
    expect(screen.queryByRole("button", { name: "Bring my DMs" })).toBeNull()

    stopMySlackRead.mockResolvedValue(undefined)
    getMySlackReads.mockResolvedValue({ reads: [job({ status: "cancelled", stage: "cancelled" })], team_imported: true })
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    await waitFor(() => expect(stopMySlackRead).toHaveBeenCalledWith("read-1"))
    expect(await screen.findByText("Stopped")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Bring my DMs" })).toBeTruthy()
  })

  it("says what came across once it's in, and what Slack didn't give when asked", async () => {
    getMySlackReadNotes.mockResolvedValue([
      { id: "n1", severity: "warning", code: "API_KIND_NOT_READ", message: "Slack didn't give the token its group DMs (missing_scope mpim:read).", created_at: "" },
    ])
    await show([
      job({
        status: "completed",
        stage: "finalize",
        completed_at: "2026-10-21T09:20:00Z",
        errors_total: 1,
        progress: { read: { dms: 9, mpims: 3, groups: 2, conversations: 14, of: 14 } },
      }),
    ])
    expect(screen.getByText("Brought")).toBeTruthy()
    expect(screen.getByText("Brought 9 DMs, 3 group DMs and 2 private channels on 21 Oct.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Bring again" })).toBeTruthy()
    expect(getMySlackReadNotes).not.toHaveBeenCalled()
    const notes = screen.getByText("What Slack didn't give (1)").closest("details")!
    notes.open = true
    fireEvent(notes, new Event("toggle"))
    expect(await screen.findByText(/missing_scope mpim:read/)).toBeTruthy()
    expect(getMySlackReadNotes).toHaveBeenCalledWith("read-1")
  })

  it("says why a read didn't finish, in the member's own words", async () => {
    await show([job({ status: "failed", stage: "failed", error_message: "Slack didn't accept the token (token_revoked). Check it, and start the read again." })])
    expect(screen.getByText("Didn't finish")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("token_revoked")
  })
})

describe("the pieces", () => {
  it("words a read's conversations, a token's problem and what an under-way read is doing", () => {
    expect(conversationsLine({ dms: 1 })).toBe("1 DM")
    expect(conversationsLine({ dms: 2, mpims: 1 })).toBe("2 DMs and 1 group DM")
    expect(conversationsLine({})).toBe("no conversations")
    expect(memberTokenProblem(` ${TOKEN} `)).toBeNull()
    expect(memberTokenProblem("xoxb-1-2-abcdefgh")).toMatch(/A bot token/)
    expect(memberTokenProblem("xoxp-1")).toMatch(/That isn't a Slack user token/)
    expect(underWayLine(job({ stage: "queued" }))).toMatch(/Waiting for another read on this server/)
    expect(underWayLine(job({ stage: "waiting" }))).toMatch(/Waiting for an import of your team's Slack/)
    expect(underWayLine(job({ status: "running", stage: "dm_messages", items_imported: 1204 }))).toBe("Bringing them in: 1,204 messages so far.")
  })

  it("names where a Slack import stands, waiting included", () => {
    expect(slackJobState({ status: "pending", stage: "queued" })).toBe("queued")
    expect(slackJobState({ status: "pending", stage: "waiting" })).toBe("waiting")
    expect(slackJobState({ status: "pending", stage: "uploading" })).toBe("pending")
    expect(slackJobLive({ status: "pending", stage: "waiting" })).toBe(true)
    expect(slackJobLive({ status: "completed", stage: "finalize" })).toBe(false)
  })

  it("asks Slack, for a member's DMs, for no public channel", () => {
    const manifest = JSON.parse(slackReadManifest(DM_READ_APP))
    expect(manifest.display_information.name).toBe("OneCamp DMs")
    expect(manifest.oauth_config.scopes.user).toEqual(expect.arrayContaining(["im:history", "mpim:history", "groups:history", "users:read.email"]))
    expect(manifest.oauth_config.scopes.user.some((s: string) => s.startsWith("channels:"))).toBe(false)
  })
})
