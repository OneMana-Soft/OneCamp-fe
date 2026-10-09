import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { JobRow } from "@/components/admin/SlackImportCard"
import type { SlackImportJob } from "@/services/slackImportService"

afterEach(cleanup)

const job = (status: SlackImportJob["status"], over: Partial<SlackImportJob> = {}): SlackImportJob => ({
  id: "11111111-2222-3333-4444-555555555555",
  slack_workspace_name: "acme",
  source: "export_zip",
  status,
  options: {} as SlackImportJob["options"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  chunks_total: 0,
  chunks_done: 0,
  chunks_failed: 0,
  items_imported: 0,
  errors_total: 0,
  ...over,
})
const noop = () => {}
const row = (j: SlackImportJob, onDiscard = noop, onPlan = noop) =>
  render(<JobRow job={j} busy={false} onPlan={onPlan} onRun={noop} onCancel={noop} onRollback={noop} onDeleteZip={noop} onShowErrors={noop} onDiscard={onDiscard} />)

describe("a Slack export's way forward", () => {
  it("can be discarded while it waits to be planned or run", () => {
    for (const status of ["validating", "planned"] as const) {
      const onDiscard = vi.fn()
      row(job(status), onDiscard)
      fireEvent.click(screen.getByRole("button", { name: "Discard" }))
      expect(onDiscard).toHaveBeenCalledOnce()
      cleanup()
    }
  })

  // An export that failed before it was planned has nothing to run: it is
  // planned again. One that failed after has both.
  it("is planned again after it failed", () => {
    const onPlan = vi.fn()
    row(job("failed"), noop, onPlan)
    expect(screen.queryByRole("button", { name: /Run/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Plan again" }))
    expect(onPlan).toHaveBeenCalledOnce()
    cleanup()
    row(job("failed", { plan: { user_count: 1 } as SlackImportJob["plan"] }))
    expect(screen.getByRole("button", { name: /Run again/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Plan again" })).toBeTruthy()
  })
})
