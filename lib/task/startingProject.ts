// Where a new task starts, when the form wasn't opened from a project: the
// project someone last made a task in, in this browser, or the only one they
// have. With several projects and no history it starts empty, and pressing
// Create asks for one, rather than guessing where the work belongs.

const LAST_PROJECT_KEY = "onecamp:last-task-project"

/** Notes the project a task was just made in, for the next new task. */
export function rememberTaskProject(projectUUID: string): void {
    try {
        localStorage.setItem(LAST_PROJECT_KEY, projectUUID)
    } catch {
        // A private window, or storage turned off: the next task asks again.
    }
}

/** The project a task was last made in, in this browser, or "". */
export function lastTaskProject(): string {
    try {
        return localStorage.getItem(LAST_PROJECT_KEY) ?? ""
    } catch {
        return ""
    }
}

/** The project a new task starts in, of projects: last, when it's still one of them, or the only one. */
export function startingProject(projects: { project_uuid: string }[] | undefined, last: string): string {
    if (!projects?.length) return ""
    if (last && projects.some((p) => p.project_uuid === last)) return last
    return projects.length === 1 ? projects[0].project_uuid : ""
}
