import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The card's data: the admin's exports.
let exportsList: unknown[] = []
let listState: { isLoading?: boolean; isError?: unknown } = {}
const refetch = vi.fn(async () => ({ exports: exportsList }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url !== "/admin/docs/exports") return { data: undefined, mutate: vi.fn() }
    if (listState.isLoading || listState.isError) return { data: undefined, ...listState, mutate: refetch }
    return { data: { exports: exportsList }, mutate: refetch }
  },
}))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const start = vi.fn(async () => ({}))
const address = vi.fn<(id: string) => Promise<string>>(async () => "https://files.example.test/workspace-docs.zip")
vi.mock("@/lib/workspaceExport/workspaceExport", async (orig) => ({
  ...(await orig<typeof import("@/lib/workspaceExport/workspaceExport")>()),
  startWorkspaceExport: () => start(),
  downloadAddress: (id: string) => address(id),
}))

const ExportCard = (await import("./ExportCard")).default
const { downloadable } = await import("./ExportCard")

afterEach(() => {
  cleanup()
  exportsList = []
  listState = {}
  toast.mockReset()
  start.mockClear()
  address.mockClear()
  refetch.mockClear()
})

const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
const dayOn = new Date(Date.now() + 23 * 3_600_000).toISOString()
const made = {
  id: "x1", kind: "export", format: "workspace-md", status: "done", progress: 100, created_at: hourAgo, finished_at: hourAgo, kept_until: dayOn, exported: 1204,
  skipped: [{ what: "3 private docs", why: "their owners haven't let them into workspace exports" }, { what: "Q3 plan", why: "it could not be read" }],
}

describe("the export card", () => {
  it("starts an export, and its button waits while one is being made", async () => {
    render(<ExportCard />)
    expect(screen.getByText("No exports yet")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Export all docs/ }))
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    expect(refetch).toHaveBeenCalled()

    cleanup()
    exportsList = [{ ...made, id: "x2", status: "running", progress: 40, finished_at: undefined, skipped: undefined }]
    render(<ExportCard />)
    expect((screen.getByRole("button", { name: /Exporting/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("progressbar", { name: "40% done" })).toBeTruthy()
  })

  // ai-search-io.md P2-4: a made export says what it holds and what it left
  // out, and downloads from the address the server gives at the time.
  it("says what a made export holds and left out, and downloads it", async () => {
    exportsList = [made]
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    try {
      render(<ExportCard />)
      expect(screen.getByText("1,204 docs")).toBeTruthy()
      expect(screen.getByText("3 private docs left out: their owners haven't let them into workspace exports.")).toBeTruthy()
      expect(screen.getByText("Couldn't be read, so not in it: ‘Q3 plan’.")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: /Download/ }))
      await waitFor(() => expect(assign).toHaveBeenCalledWith("https://files.example.test/workspace-docs.zip"))
      expect(address).toHaveBeenCalledWith("x1")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // The server says until when it keeps the zip, and nothing once it is gone.
  it("says when a made export's zip is no longer kept", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
    exportsList = [{ ...made, created_at: twoDaysAgo, finished_at: twoDaysAgo, kept_until: dayAgo }]
    render(<ExportCard />)
    expect(screen.getByText("No longer kept")).toBeTruthy()
    expect(screen.queryByText("Ready")).toBeNull()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
    expect(downloadable(exportsList[0] as Parameters<typeof downloadable>[0])).toBe(false)
    expect(downloadable({ ...made, kept_until: undefined } as Parameters<typeof downloadable>[0])).toBe(false)
  })

  it("says why the list couldn't load, never that there is nothing", () => {
    listState = { isError: { response: { status: 503, data: { msg: "Imports and exports are not available on this server right now." } } } }
    render(<ExportCard />)
    expect(screen.queryByText("No exports yet")).toBeNull()
    expect(screen.getByText(/Imports and exports are not available on this server right now\./)).toBeTruthy()
  })

  it("says why an export couldn't be started", async () => {
    start.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only an admin can export the workspace." } } })
    render(<ExportCard />)
    fireEvent.click(screen.getByRole("button", { name: /Export all docs/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Only an admin can export the workspace."))
  })
})
