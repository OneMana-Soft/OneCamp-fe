import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

type Answer = { data?: unknown; isLoading?: boolean; isError?: unknown }
let answers: Record<string, Answer> = {}
const refetch = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ ...(answers[url] ?? { data: undefined }), mutate: refetch }),
}))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: { suppressErrorToast: true } }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const ArchiveCard = (await import("./ArchiveCard")).default

const POLICIES = "/admin/archive/policies"
const JOBS = "/admin/archive/jobs"
const STATS = "/admin/archive/stats"

const policy = { id: "p1", entity_type: "posts", retention_days: 365, auto_archive: true, archive_completed_tasks: false, archive_inactive_channels_days: 90, compress_attachments: false, created_at: "", updated_at: "" }
const job = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  entity_type: "posts",
  status,
  started_at: "2026-10-05T02:00:00Z",
  items_processed: 4218,
  items_archived: 4186,
  items_failed: 0,
  created_at: "2026-10-05T02:00:00Z",
  ...over,
})
const stats = { total_archived_posts: 18432, total_archived_chats: 6210, total_archived_tasks: 1874, total_archived_recordings: 23, total_archived_attachments: 1129, total_archived_docs: 47 }

afterEach(() => {
  cleanup()
  answers = {}
  refetch.mockReset()
  post.mockReset()
  toast.mockReset()
})

describe("the archive card", () => {
  // A failed read said "No archive policies configured." and "No archive jobs
  // have been run yet.": claims about the workspace, with nothing to do.
  it("says the rules couldn't load, with Try again, not that there are none", () => {
    answers = { [POLICIES]: { isError: new Error("Network Error") }, [JOBS]: { data: { jobs: [] } }, [STATS]: { data: { stats } } }
    render(<ArchiveCard />)
    expect(screen.getByText("Couldn't load the archive rules")).toBeTruthy()
    expect(screen.queryByText(/No archive policies/)).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0])
    expect(refetch).toHaveBeenCalled()
  })

  it("says the history couldn't load, not that nothing has run", () => {
    answers = { [POLICIES]: { data: { policies: [policy] } }, [JOBS]: { isError: new Error("Network Error") }, [STATS]: { data: { stats } } }
    render(<ArchiveCard />)
    expect(screen.getByText("Couldn't load the archive history")).toBeTruthy()
    expect(screen.queryByText(/No archive jobs/)).toBeNull()
  })

  // Status was raw blue and grey with an icon beside every word, a spinning
  // one while running; a run still going showed "—" for its time.
  it("says where each run stands in status tokens, with no icon and no dash", () => {
    answers = {
      [POLICIES]: { data: { policies: [policy] } },
      [JOBS]: { data: { jobs: [job("j1", "running"), job("j2", "cancelled", { completed_at: "2026-10-05T02:01:48Z" })] } },
      [STATS]: { data: { stats } },
    }
    const { container } = render(<ArchiveCard />)
    const history = screen.getByRole("list", { name: "Archive history" })
    expect(history.innerHTML).not.toMatch(/(?:bg|text|border)-(?:blue|gray)-\d/)
    expect(screen.getByText("Archiving")).toBeTruthy()
    expect(screen.getByText("Cancelled")).toBeTruthy()
    expect(container.textContent).not.toMatch(/—/)
  })

  // The counts sat beside grey chips; each kind now has its own tile, the same
  // one as in its rule and its history.
  it("shows each kind's count on its own hued tile", () => {
    answers = { [POLICIES]: { data: { policies: [policy] } }, [JOBS]: { data: { jobs: [] } }, [STATS]: { data: { stats } } }
    render(<ArchiveCard />)
    const counts = screen.getByRole("list", { name: "Archived so far" })
    expect(counts.querySelector(".hue-sky")).toBeTruthy()
    expect(counts.textContent).toContain("18,432")
    expect(counts.textContent).toContain("Channel posts")
  })

  it("says why undoing a run was refused, in plain words", async () => {
    answers = {
      [POLICIES]: { data: { policies: [policy] } },
      [JOBS]: { data: { jobs: [job("j1", "completed", { completed_at: "2026-10-05T02:01:48Z" })] } },
      [STATS]: { data: { stats } },
    }
    post.mockRejectedValue({ response: { status: 409, data: { code: "archive_running", error: "an archive job is already running" } } })
    render(<ArchiveCard />)
    fireEvent.click(screen.getByRole("button", { name: "Restore what this run archived" }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't restore what this run archived", description: "Archiving is running right now. Try again when it finishes." }),
      ),
    )
  })
})
