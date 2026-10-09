import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { JobRow } from "@/components/admin/SlackImportCard"
import type { SlackImportJob } from "@/services/slackImportService"

afterEach(cleanup)

const job = (status: SlackImportJob["status"]): SlackImportJob => ({
  id: "11111111-2222-3333-4444-555555555555",
  slack_workspace_name: "acme",
  source: "export_zip",
  status,
  options: {} as SlackImportJob["options"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  chunks_total: 10,
  chunks_done: 10,
  chunks_failed: 0,
  items_imported: 12400,
  errors_total: 0,
})

const noop = () => {}

describe("a finished Slack import", () => {
  it("offers to invite the people who came across", () => {
    const onInvite = vi.fn()
    render(<JobRow job={job("completed")} busy={false} onPlan={noop} onRun={noop} onCancel={noop} onRollback={noop} onDeleteZip={noop} onShowErrors={noop} onInvite={onInvite} />)
    fireEvent.click(screen.getByRole("button", { name: /Invite people/ }))
    expect(onInvite).toHaveBeenCalledOnce()
  })

  it("doesn't offer them while it runs", () => {
    render(<JobRow job={job("running")} busy={false} onPlan={noop} onRun={noop} onCancel={noop} onRollback={noop} onDeleteZip={noop} onShowErrors={noop} onInvite={noop} />)
    expect(screen.queryByRole("button", { name: /Invite people/ })).toBeNull()
  })
})
