import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ImportJobRow, isWaiting } from "./ImportJobRow"
import type { ImportJob } from "@/services/importService"

afterEach(cleanup)

const job = (status: ImportJob["status"], over: Partial<ImportJob> = {}): ImportJob => ({
  id: "j1",
  provider: "jira",
  source_workspace_name: "Acme",
  source: "api",
  status,
  options: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  chunks_total: 4,
  chunks_done: 2,
  chunks_failed: 0,
  items_imported: 120,
  errors_total: 0,
  ...over,
})

const handlers = () => ({
  onPlan: vi.fn(),
  onDiscard: vi.fn(),
  onCancel: vi.fn(),
  onRollback: vi.fn(),
  onRetryFailed: vi.fn(),
  onInvite: vi.fn(),
  onShowErrors: vi.fn(),
})

const buttons = () => screen.queryAllByRole("button").map((b) => b.textContent?.trim())

describe("an import job's way forward", () => {
  // A waiting job used to have none: Cancel only stopped a running one, and
  // the waiting job kept its workspace's label busy.
  it("can be planned or discarded while it waits", () => {
    for (const status of ["validating", "planned"] as const) {
      const h = handlers()
      render(<ImportJobRow job={job(status)} {...h} />)
      expect(buttons()).toEqual(["Plan", "Discard"])
      fireEvent.click(screen.getByRole("button", { name: "Discard" }))
      expect(h.onDiscard).toHaveBeenCalledOnce()
      cleanup()
    }
    render(<ImportJobRow job={job("pending")} {...handlers()} />)
    expect(buttons()).toEqual(["Discard"])
    expect(isWaiting("pending") && isWaiting("validating") && isWaiting("planned") && !isWaiting("running")).toBe(true)
  })

  it("can be planned again once it failed, and says why it failed", () => {
    const h = handlers()
    render(<ImportJobRow job={job("failed", { error_message: "Jira didn't accept that email and API token.", chunks_failed: 1 })} {...h} />)
    expect(buttons()).toEqual(["Plan again", "Roll back", "Retry failed"])
    expect(screen.getByText("Jira didn't accept that email and API token.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Plan again" }))
    expect(h.onPlan).toHaveBeenCalledOnce()
  })

  it("offers the people who came across once it finished, and can be cancelled while it runs", () => {
    render(<ImportJobRow job={job("completed")} {...handlers()} />)
    expect(buttons()).toEqual(["Invite people", "Roll back"])
    expect(screen.getByText("Finished")).toBeTruthy()
    cleanup()
    render(<ImportJobRow job={job("running", { stage: "tasks" })} {...handlers()} />)
    expect(buttons()).toEqual(["Cancel"])
    expect(screen.getByText(/tasks/)).toBeTruthy()
  })

  it("names the provider in a list of every provider's jobs", () => {
    render(<ImportJobRow job={job("completed", { provider: "monday" })} showProvider {...handlers()} />)
    expect(screen.getByText(/monday\.com ·/)).toBeTruthy()
  })
})
