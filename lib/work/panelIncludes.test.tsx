import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { SWRConfig, useSWRConfig } from "swr"
import { useEffect, type ReactNode } from "react"

// PR3 (the BE audit's panel fan-out): the panel asks for the task with its
// other reads (?include=), puts each under the key its own read keeps it by,
// and a part's hook that mounts then shows it without asking again.

const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))

const { bindAppMutate } = await import("@/lib/swrMutate")
const { useFetch } = await import("@/hooks/useFetch")
const { PANEL_INCLUDE, seedPanelParts } = await import("@/lib/work/panelIncludes")

function Bridge() {
  const { mutate, cache } = useSWRConfig()
  bindAppMutate(mutate, cache)
  useEffect(() => () => bindAppMutate(null), [])
  return null
}

function Shown({ url }: { url: string }) {
  const { data } = useFetch<{ data: unknown }>(url)
  return <p data-testid={url}>{data === undefined ? "…" : JSON.stringify(data)}</p>
}

const wrap = (children: ReactNode) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <Bridge />
    {children}
  </SWRConfig>
)

const included = {
  cycle: { data: { id: "c1", name: "Cycle 1" } },
  recurrence: { data: { rule: "FREQ=WEEKLY", mode: "schedule" } },
  client_review: { data: null },
  time_summary: { data: { entries: [], seconds: 3600, billable_seconds: 3600, running: null } },
  sync_status: { data: { status: "synced", attempts: 1 } },
  statuses: { data: { statuses: [] } },
  fields: { data: { fields: [], can_edit: true } },
  estimates: { data: { scale: { kind: "fibonacci", sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }, kinds: [], can_edit: false } },
}

const keys = [
  "/task/cycle/t1",
  "/task/recurrence/t1",
  "/task/clientReview/t1",
  "/task/time/t1",
  "/task/github-sync-status/t1",
  "/project/p1/statuses",
  "/project/p1/fields",
  "/project/p1/estimates",
]

afterEach(() => {
  cleanup()
  get.mockReset()
})

describe("the task panel's parts", () => {
  it("asks for every part the panel shows", () => {
    expect(PANEL_INCLUDE.split(",").sort()).toEqual(["client_review", "cycle", "project_meta", "recurrence", "sync_status", "time_summary"])
  })

  it("puts each part under its own read's key, and those reads don't ask again", async () => {
    get.mockResolvedValue({ data: { data: "asked again" } })
    const { rerender, getByTestId } = render(wrap(null))
    seedPanelParts("t1", "p1", included)
    rerender(wrap(keys.map((k) => <Shown key={k} url={k} />)))
    await waitFor(() => expect(getByTestId("/task/time/t1").textContent).toContain("3600"))
    expect(getByTestId("/task/cycle/t1").textContent).toContain("Cycle 1")
    expect(getByTestId("/project/p1/fields").textContent).toContain("can_edit")
    // The project's scale, which the Points row sizes on (linear-05).
    expect(getByTestId("/project/p1/estimates").textContent).toContain("fibonacci")
    expect(getByTestId("/task/clientReview/t1").textContent).toBe(JSON.stringify({ data: null }))
    await new Promise((r) => setTimeout(r, 20))
    expect(get).not.toHaveBeenCalled()
  })

  it("leaves a part the server didn't send to its own read", async () => {
    get.mockResolvedValue({ data: { data: { status: "pending" } } })
    const { rerender, getByTestId } = render(wrap(null))
    seedPanelParts("t2", "p1", { cycle: { data: null } })
    rerender(wrap(<Shown url="/task/github-sync-status/t2" />))
    await waitFor(() => expect(getByTestId("/task/github-sync-status/t2").textContent).toContain("pending"))
    expect(get).toHaveBeenCalledTimes(1)
  })
})
