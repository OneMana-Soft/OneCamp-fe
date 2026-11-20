// The requests behind a call's recap on its event (gcal-new-event-notes, head B): the event panel fetches this when
// one is used, so the event's first screen carries none of it (app/firstLoad.test's source ceiling). No imports, as
// lib/calendar/trash and eventFiles, so its chunk reaches no shared core. The routes: router/calendarAnswers.go.

/** The projects the reader is in, as GET /user/userProjectList answers them (quiet: Make task says it can't). */
export const projectsRequest = { method: "GET", apiEndpoint: "/user/userProjectList", quiet: true } as const

/** The projects a task may go in, from that answer (the server leaves deleted ones out: its Live filter). Pure. */
export function projectsOf(answer: unknown): { uuid: string; name: string }[] {
  const list = (answer as { user_projects?: { project_uuid?: string; project_name?: string }[] } | undefined)?.user_projects
  return (Array.isArray(list) ? list : []).filter((p) => p.project_uuid).map((p) => ({ uuid: p.project_uuid!, name: p.project_name ?? "" }))
}

/**
 * Makes one of a call's recap's action items a task in a project, for whoever may change the event and add tasks
 * there; the server puts it on the event and answers the item's task (a second ask answers the same one). Its
 * refusal is said in a toast.
 */
export function makeActionTaskRequest(id: string, key: string, index: number, project: string) {
  return {
    method: "POST",
    apiEndpoint: "/calendar/events",
    appendToUrl: `/${encodeURIComponent(id)}/call/artefacts/${encodeURIComponent(key)}/action-items/${index}/task`,
    payload: { project_uuid: project },
    showErrorToast: true,
    failureTitle: "Couldn't make the task",
  } as const
}
