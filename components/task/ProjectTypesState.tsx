"use client"

import { SaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * A menu of a project's types while they load, or when they couldn't: one line
 * above its choices (the Filter's Type facet, a task's type picker). The read
 * (hooks/useProjectTypes) raises no toast, so this line is where it's said.
 */
export function ProjectTypesState({ loading, failed }: { loading: boolean; failed: boolean }) {
  if (failed)
    return (
      <p className="px-2 py-1.5 text-ui-sm text-danger-ink">
        <SaysLoadFailure />
        Couldn&apos;t load the types. Close and try again.
      </p>
    )
  return loading ? <p className="px-2 py-1.5 text-ui-sm text-ink-3">Loading types…</p> : null
}
