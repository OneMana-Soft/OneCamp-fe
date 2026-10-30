"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Download } from "@/lib/icons"

/**
 * Export CSV: saves a task list as it reads (lib/tasks/exportTaskList), from
 * Display on a computer and the list's sort and filter sheet on a phone. It
 * says it is working, and isn't asked twice, until the file is made; onExport
 * says its own failure.
 */
export function ExportCSVButton({ onExport, className }: { onExport: () => Promise<void>; className?: string }) {
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await onExport()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" className={className} busy={busy} onClick={() => void run()}>
      <Download className="size-3.5" aria-hidden />
      {busy ? "Exporting…" : "Export CSV"}
    </Button>
  )
}
