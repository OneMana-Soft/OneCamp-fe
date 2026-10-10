import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

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

const { default: ArchiveCard, duration } = await import("./ArchiveCard")

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

// One frame for every admin tab: Archive was a bordered Card with a p-4
// header, its title 17px right and down of every other tab's, and its three
// parts sat in it as boxes.
describe("the archive section's frame", () => {
  const loaded = () => ({
    [POLICIES]: { data: { policies: [policy] } },
    [JOBS]: { data: { jobs: [job("j1", "completed", { completed_at: "2026-10-05T02:01:48Z", items_failed: 4 })] } },
    [STATS]: { data: { stats } },
  })

  it("is a section with its title, one action on the title's row, and its parts as sections inside it", () => {
    answers = loaded()
    const { container } = render(<ArchiveCard />)
    const region = screen.getByRole("region", { name: "Archive" })
    expect(screen.getByRole("heading", { level: 2, name: "Archive" })).toBeTruthy()
    expect(container.querySelector(".rounded-xl")).toBeNull()
    const action = region.querySelector("[data-section-action]") as HTMLElement
    expect(within(action).getByRole("button", { name: "Restore items" })).toBeTruthy()
    for (const name of ["Archived so far", "Archive rules", "Archive history"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy()
    }
  })

  // The bar's status: a dot and a word, where a run was a tinted pill.
  it("says where a run stands as a dot and a word, and its facts on one dotted line", () => {
    answers = loaded()
    render(<ArchiveCard />)
    const history = screen.getByRole("list", { name: "Archive history" })
    const done = within(history).getByText("Done")
    expect(done.getAttribute("data-status-word")).toBe("success")
    expect(done.className).not.toMatch(/border|bg-success\/10/)
    const meta = history.querySelector("li p") as HTMLElement
    expect(meta.textContent).toMatch(/4,186 archived · 4 failed · took 1m 48s/)
    expect(within(history).getByText("4 failed").className).toContain("text-danger-ink")
  })

  it("puts each rule's and run's tile at the list rows' one size", () => {
    answers = loaded()
    render(<ArchiveCard />)
    for (const name of ["Archive rules", "Archive history"]) {
      const row = screen.getByRole("list", { name }).querySelector("li") as HTMLElement
      expect(row.className).toContain("px-4 py-3")
      expect(row.querySelector(".size-8")).toBeTruthy()
    }
  })

  it("says nothing has been archived yet with the workspace's tile, not a boxed line", () => {
    answers = { [POLICIES]: { data: { policies: [] } }, [JOBS]: { data: { jobs: [] } }, [STATS]: { data: { stats } } }
    render(<ArchiveCard />)
    expect(screen.getByText("No archive rules on this server")).toBeTruthy()
    expect(screen.getByText("Nothing archived yet")).toBeTruthy()
    expect(document.querySelectorAll(".hue-sun").length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector("p.rounded-lg")).toBeNull()
  })

  it("says the server's reason for a failed read", () => {
    answers = {
      [POLICIES]: { isError: { response: { status: 403, data: { msg: "Only admins can see the archive rules." } } } },
      [JOBS]: { data: { jobs: [] } },
      [STATS]: { data: { stats } },
    }
    render(<ArchiveCard />)
    expect(screen.getByText("Only admins can see the archive rules.")).toBeTruthy()
  })

  it("says how long a run took as a person says it", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 9, 5, 2, 0, s)).toISOString()
    expect(duration({ started_at: at(0), completed_at: new Date(Date.UTC(2026, 9, 5, 2, 0, 0, 108)).toISOString() })).toBe("108ms")
    expect(duration({ started_at: at(0), completed_at: at(41) })).toBe("41s")
    expect(duration({ started_at: at(0), completed_at: at(108) })).toBe("1m 48s")
    expect(duration({ started_at: at(0), completed_at: at(373) })).toBe("6m 13s")
    expect(duration({ started_at: at(0), completed_at: at(360) })).toBe("6m")
    expect(duration({ started_at: at(0) })).toBe("")
  })
})
