import { describe, expect, it, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { JobRow } from "@/components/admin/SlackImportCard"
import type { SlackImportJob } from "@/services/slackImportService"

afterEach(cleanup)

// A completed import that brought real content across.
const completedJob = (overrides: Partial<SlackImportJob> = {}): SlackImportJob => ({
  id: "11111111-2222-3333-4444-555555555555",
  slack_workspace_name: "acme",
  source: "export_zip",
  status: "completed",
  options: {} as SlackImportJob["options"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  chunks_total: 10,
  chunks_done: 10,
  chunks_failed: 0,
  items_imported: 12400,
  errors_total: 0,
  ...overrides,
})

const noop = () => {}

const renderRow = (job: SlackImportJob) =>
  render(
    <JobRow
      job={job}
      busy={false}
      onPlan={noop}
      onRun={noop}
      onCancel={noop}
      onRollback={noop}
      onDeleteZip={noop}
      onShowErrors={noop}
    />,
  )

describe("import digest", () => {
  // The whole point of the feature: the import stops ending on a number and
  // starts ending on an answer about the customer's own data.
  it("shows what came across when the server produced a digest", () => {
    const digest =
      "Most of the traffic is a long-running argument about moving billing off Stripe, plus a release checklist nobody finished."
    renderRow(completedJob({ digest }))

    expect(screen.getByText(digest)).toBeTruthy()
  })

  // The AI-free edition, AI switched off, and every job that predates digests
  // all send no field. None of them may render an empty box with a heading.
  it("renders nothing when the server sent no digest", () => {
    renderRow(completedJob())

    expect(screen.queryByText(/what came across/i)).toBeNull()
  })

  // A digest is stored only after the job is already completed, so it must not
  // depend on the completed branch that draws the stats grid: a job that was
  // rolled back after a digest was written still has one to show.
  it("does not hide the digest behind the running-or-completed stats block", () => {
    const digest = "Two channels of release chatter and a dormant design review."
    renderRow(completedJob({ status: "rolled_back", digest }))

    expect(screen.getByText(digest)).toBeTruthy()
  })
})
