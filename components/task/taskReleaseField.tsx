"use client"

// The task panel's Release row (jira-04 Head B): the releases of its project
// the task is in, any number of them. GET /task/release/{task} reads them with
// the project's newest releases to offer; a tick sets the whole set (POST
// /task/release), which fills the release's task list (its sheet shows it at
// once). Whoever may edit the task sets it (can_edit, from the server); a
// release that's out changes only for the project's admins
// (can_change_released); an archived project's are read-only. A refusal is
// said in the server's own words and the row stays as it was. A task in no
// project has no row, nor one in a project with no releases, nor one whose
// read failed. On the shared pick row's twin (taskPicksRow), as the Cycle row
// is on it. A lazy part of the panel that reaches none of the shared core
// (main's chunking rule, 30 Oct; app/releasesLazy.test): the panel hands it
// its HTTP client and toast, as the Releases tab hands the page's to its view,
// and it reads through the releases' kept read (one per path).

import * as React from "react"
import { TaskPicksRow } from "@/components/task/taskPicksRow"
import { useKeptRead } from "@/components/work/releases/releaseParts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { taskReleaseCalls, taskReleasePath, type Release, type ReleaseHttp, type TaskReleases } from "@/lib/work/releases"

/**
 * Its choices: the project's releases, then one it is in that the list no longer offers. One that's out says so
 * in its name ("v2.3 · released"), so a non-admin sees why it is closed and an admin reads it as out.
 */
function releaseOptions(t: TaskReleases) {
  const all: Release[] = [...t.options, ...t.releases.filter((r) => !t.options.some((o) => o.id === r.id))]
  return all.map((r) => {
    const out = r.state === "released"
    return { id: r.id, label: out ? `${r.name} · released` : r.name, disabled: out && !t.can_change_released }
  })
}

export function TaskReleaseField({ taskUUID, projectId, http, toast }: {
  taskUUID: string
  projectId?: string
  /** The panel's HTTP client. */
  http: ReleaseHttp
  /** The panel's toast, which says a refused change. */
  toast: (t: { title: string; description: string; tone: "error" }) => unknown
}) {
  const calls = React.useMemo(() => taskReleaseCalls(http), [http])
  const load = React.useCallback(() => calls.get(taskUUID), [calls, taskUUID])
  const read = useKeptRead<TaskReleases>(taskUUID && projectId ? taskReleasePath(taskUUID) : null, load)
  const [busy, setBusy] = React.useState(false)
  const field = read.data

  if (!projectId || !field || (field.options.length === 0 && field.releases.length === 0)) return null

  const pick = async (ids: string[]) => {
    setBusy(true)
    try {
      read.keep(await calls.set(taskUUID, ids))
    } catch (e) {
      toast({ title: "The releases didn't change", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
    }
    setBusy(false)
  }

  return (
    <TaskPicksRow
      label="Release"
      none="No release"
      chosen={field.releases.map((r) => ({ id: r.id, label: r.name }))}
      options={releaseOptions(field)}
      onPick={(ids) => void pick(ids)}
      disabled={!field.can_edit || busy}
      property="release"
    />
  )
}
