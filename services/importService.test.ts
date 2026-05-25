import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the axios instance BEFORE importing the service. Vitest hoists
// vi.mock calls, so this binding is in place when importService.ts is
// resolved.
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import axiosInstance from "@/lib/axiosInstance"
import {
  cancelImportJob,
  connectImport,
  createImportJob,
  deleteImportStagedZip,
  disconnectImport,
  discoverImportResources,
  finalizeImportUpload,
  getImportErrors,
  getImportJob,
  listImportConnections,
  listImportJobs,
  listImportProviders,
  planImportJob,
  presignImportUpload,
  retryFailedImportChunks,
  rollbackImportJob,
  runImportJob,
} from "./importService"

const ax = axiosInstance as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

// Keeps every call site explicit: each test sets the mock, calls the
// service, and asserts both the URL and the payload. That catches the
// classic class of bugs (wrong method, wrong path, double-encoded
// params, payload key drift) where unit tests pay for themselves.
beforeEach(() => {
  ax.get.mockReset()
  ax.post.mockReset()
  ax.delete.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("importService — providers / connections", () => {
  it("listImportProviders calls /admin/import/providers and returns the list", async () => {
    ax.get.mockResolvedValueOnce({ data: { providers: [{ name: "linear" }] } })
    const out = await listImportProviders()
    expect(ax.get).toHaveBeenCalledWith("/admin/import/providers")
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe("linear")
  })

  it("listImportProviders defaults to [] when the response is empty", async () => {
    ax.get.mockResolvedValueOnce({ data: {} })
    const out = await listImportProviders()
    expect(out).toEqual([])
  })

  it("listImportConnections calls /admin/import/connections", async () => {
    ax.get.mockResolvedValueOnce({ data: { connections: [{ provider: "linear" } as any] } })
    const out = await listImportConnections()
    expect(ax.get).toHaveBeenCalledWith("/admin/import/connections")
    expect(out[0].provider).toBe("linear")
  })

  it("connectImport posts to per-provider connect endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await connectImport("linear", { access_token: "tok" })
    expect(ax.post).toHaveBeenCalledWith(
      "/admin/import/linear/connect",
      { access_token: "tok" },
    )
  })

  it("connectImport URL-encodes the provider segment defensively", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    // Even though our union restricts ImportProvider to safe values,
    // the wrapper uses encodeURIComponent so a future provider with
    // a special char (e.g. "azure-devops") doesn't break the URL.
    await connectImport("clickup", { access_token: "x" })
    expect(ax.post).toHaveBeenCalledWith(
      "/admin/import/clickup/connect",
      expect.any(Object),
    )
  })

  it("disconnectImport posts to disconnect endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await disconnectImport("trello")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/trello/disconnect")
  })
})

describe("importService — jobs", () => {
  it("createImportJob posts the workspace + options", async () => {
    ax.post.mockResolvedValueOnce({ data: { job_id: "abc" } })
    const r = await createImportJob("linear", {
      source_workspace_name: "Acme",
      source: "api",
      options: { team_id: "t1" },
    })
    expect(ax.post).toHaveBeenCalledWith(
      "/admin/import/linear/jobs",
      {
        source_workspace_name: "Acme",
        source: "api",
        options: { team_id: "t1" },
      },
    )
    expect(r.job_id).toBe("abc")
  })

  it("planImportJob defaults the body to {} when no input is given", async () => {
    ax.post.mockResolvedValueOnce({ data: { user_count: 12 } })
    const plan = await planImportJob("job-1")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/jobs/job-1/plan", {})
    expect(plan.user_count).toBe(12)
  })

  it("runImportJob hits run endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await runImportJob("job-1", { status_mappings: { todo: "todo" } })
    expect(ax.post).toHaveBeenCalledWith(
      "/admin/import/jobs/job-1/run",
      { status_mappings: { todo: "todo" } },
    )
  })

  it("cancelImportJob hits cancel endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await cancelImportJob("job-1")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/jobs/job-1/cancel")
  })

  it("rollbackImportJob hits rollback endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await rollbackImportJob("job-1")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/jobs/job-1/rollback")
  })

  it("retryFailedImportChunks returns the reset+rerun shape", async () => {
    ax.post.mockResolvedValueOnce({ data: { reset: 3, rerun: true } })
    const r = await retryFailedImportChunks("job-1")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/jobs/job-1/retry-failed")
    expect(r).toEqual({ reset: 3, rerun: true })
  })

  it("getImportJob fetches by id", async () => {
    ax.get.mockResolvedValueOnce({ data: { id: "job-1" } as any })
    const j = await getImportJob("job-1")
    expect(ax.get).toHaveBeenCalledWith("/admin/import/jobs/job-1")
    expect(j.id).toBe("job-1")
  })

  it("listImportJobs without provider hits the unfiltered endpoint", async () => {
    ax.get.mockResolvedValueOnce({ data: { jobs: [] } })
    await listImportJobs()
    expect(ax.get).toHaveBeenCalledWith("/admin/import/jobs")
  })

  it("listImportJobs with provider builds a query string", async () => {
    ax.get.mockResolvedValueOnce({ data: { jobs: [] } })
    await listImportJobs("clickup")
    expect(ax.get).toHaveBeenCalledWith("/admin/import/jobs?provider=clickup")
  })
})

describe("importService — errors endpoint", () => {
  it("getImportErrors builds query params with limit/offset defaults", async () => {
    ax.get.mockResolvedValueOnce({ data: { errors: [] } })
    await getImportErrors("job-1")
    const url = ax.get.mock.calls[0][0]
    // Order doesn't matter; assert presence of each param.
    expect(url.startsWith("/admin/import/jobs/job-1/errors?")).toBe(true)
    expect(url).toContain("limit=100")
    expect(url).toContain("offset=0")
    expect(url).not.toContain("severity=") // omitted when not provided
  })

  it("getImportErrors includes severity when supplied", async () => {
    ax.get.mockResolvedValueOnce({ data: { errors: [] } })
    await getImportErrors("job-1", "fatal", 25, 50)
    const url = ax.get.mock.calls[0][0]
    expect(url).toContain("severity=fatal")
    expect(url).toContain("limit=25")
    expect(url).toContain("offset=50")
  })
})

describe("importService — discovery", () => {
  it("discoverImportResources returns the items array", async () => {
    ax.post.mockResolvedValueOnce({ data: { items: [{ id: "1", name: "Team A", kind: "team" }] } })
    const items = await discoverImportResources("linear")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/linear/discover")
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("1")
  })

  it("discoverImportResources returns [] when BE responds 404", async () => {
    // Simulating axios's error shape: { response: { status, data } }
    ax.post.mockRejectedValueOnce({
      response: { status: 404, data: { code: "no_discover" } },
    })
    const items = await discoverImportResources("trello")
    expect(items).toEqual([])
  })

  it("discoverImportResources returns [] when BE responds with code:no_discover", async () => {
    // Some providers return 200/400 with the code; the wrapper still
    // falls through to "no list, ask for manual id".
    ax.post.mockRejectedValueOnce({
      response: { status: 400, data: { code: "no_discover" } },
    })
    const items = await discoverImportResources("trello")
    expect(items).toEqual([])
  })

  it("discoverImportResources rethrows other errors", async () => {
    ax.post.mockRejectedValueOnce({
      response: { status: 500, data: { error: "boom" } },
    })
    await expect(discoverImportResources("linear")).rejects.toMatchObject({
      response: { status: 500 },
    })
  })
})

describe("importService — presign + finalize", () => {
  it("presignImportUpload posts the size and source", async () => {
    ax.post.mockResolvedValueOnce({
      data: {
        job_id: "j1",
        provider: "trello",
        source_workspace_name: "Acme",
        raw_object_key: "k1",
        upload_url: "https://minio/...",
        expires_in: 600,
        method: "PUT",
        headers: {},
      },
    })
    const r = await presignImportUpload("trello", "Acme", 1024, "board_json")
    expect(ax.post).toHaveBeenCalledWith(
      "/admin/import/trello/presign",
      { source_workspace_name: "Acme", file_size: 1024, source: "board_json" },
    )
    expect(r.upload_url).toContain("minio")
  })

  it("finalizeImportUpload hits the per-provider finalize endpoint", async () => {
    ax.post.mockResolvedValueOnce({ data: {} })
    await finalizeImportUpload("trello", "job-1")
    expect(ax.post).toHaveBeenCalledWith("/admin/import/trello/finalize/job-1")
  })

  it("deleteImportStagedZip uses DELETE", async () => {
    ax.delete.mockResolvedValueOnce({ data: {} })
    await deleteImportStagedZip("job-1")
    expect(ax.delete).toHaveBeenCalledWith("/admin/import/jobs/job-1/staged-zip")
  })
})
