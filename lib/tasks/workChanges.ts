/**
 * The Work Change Log on the web (projects WCL-2; the backend's WCL-1,
 * business/WorkFeed): every task write is an entry, numbered in commit order.
 * An open board, list, timeline or panel takes each entry as it comes on its
 * project's topic (Task_Changed), and catches up on what it missed through
 * GET /work/changes when the connection comes back or the tab is shown again.
 *
 * Pure: lib/tasks/workFeed gives it the patchers every view already uses
 * (hooks/useTaskUpdate), the read over the app's HTTP client (readerOver),
 * and where the place is kept (lib/offline/workCursor).
 *
 * Permission model: it grants nothing. The server answers each reader only
 * the entries they may see, and a change to a task only a few may see comes
 * as its project's re-read, naming nothing; this applies what it is told to
 * what this member already has open.
 */

/** One entry, as GET /work/changes answers it and a Task_Changed message carries it. */
export interface WorkEntry {
  sequence: number
  kind?: string
  resource_kind?: string
  resource_uuid: string
  project_uuid?: string
  diff?: Record<string, unknown> | null
  actor?: string
}

/** What a Task_Changed message says for the open views: an entry, a project to read again, or nothing of theirs. */
export type WorkSignal = { entry: WorkEntry } | { reread: string } | null

/** A task's fields, by the task answer's own names. */
export type TaskPatch = { task_uuid: string } & Record<string, unknown>

/** How an entry reaches what's open (hooks/useTaskUpdate's patchers). */
export interface TaskPatchers {
  updateTasks(patches: TaskPatch[], projectId: string): void
  moveTask(patch: TaskPatch, projectId: string): void
  setTaskField(taskId: string, projectId: string, fieldId: string, value: unknown): void
  deleteTask(taskId: string, projectId: string): void
  rereadProject(projectId: string): void
}

/** What the feed reads, keeps and changes; read answers "gone" for a place the log no longer has (410). */
export interface WorkFeedDeps {
  read(cursor: string, limit: number): Promise<{ entries: WorkEntry[]; cursor: string } | "gone">
  loadCursor(): Promise<string | undefined>
  saveCursor(cursor: string): Promise<void>
  apply(entries: WorkEntry[]): void
  rereadAll(): void
}

export interface WorkFeed {
  /** An entry heard on a project's topic. */
  live(entry: WorkEntry): void
  /** Reads what came after the kept place and applies it. */
  catchUp(): Promise<void>
}

/** The most one read asks for: the server's own cap (WorkFeed MaxSince). */
export const WORK_PAGE = 500
/** Past this many pages a catch-up reads the open lists again instead: cheaper than patching thousands of changes. */
export const WORK_MAX_PAGES = 4

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function signalOfMessage(data: unknown): WorkSignal {
  if (!isObject(data) || typeof data.project_uuid !== "string" || !data.project_uuid) return null
  if (data.reread === true) return { reread: data.project_uuid }
  const { sequence, kind, task_uuid } = data
  if (typeof sequence !== "number" || sequence <= 0 || typeof kind !== "string" || typeof task_uuid !== "string" || !task_uuid) return null
  return {
    entry: {
      sequence,
      kind,
      resource_kind: "task",
      resource_uuid: task_uuid,
      project_uuid: data.project_uuid,
      diff: isObject(data.diff) ? data.diff : null,
      actor: typeof data.by === "string" ? data.by : undefined,
    },
  }
}

/**
 * Applies entries in the log's order. Changes of fields in place wait to go
 * to their project's lists together (one change to each list for the lot);
 * anything else for that project (a move, a field value, a delete) lets them
 * go first, so nothing lands out of order.
 */
export function applyEntries(entries: WorkEntry[], to: TaskPatchers): void {
  const waiting = new Map<string, Map<string, TaskPatch>>()
  const reread = new Set<string>()
  const flush = (project: string) => {
    const patches = waiting.get(project)
    if (!patches) return
    waiting.delete(project)
    to.updateTasks([...patches.values()], project)
  }
  const rereadOnce = (project: string) => {
    if (reread.has(project)) return
    reread.add(project)
    to.rereadProject(project)
  }

  for (const e of entries) {
    const project = e.project_uuid
    const task = e.resource_uuid
    if (!project || !task || (e.resource_kind !== undefined && e.resource_kind !== "task")) continue
    switch (e.kind) {
      case "task.created":
      case "task.restored":
        rereadOnce(project)
        break
      case "task.deleted":
        flush(project)
        to.deleteTask(task, project)
        break
      case "task.updated": {
        const diff = e.diff
        if (!diff || Object.keys(diff).length === 0) break
        if (typeof diff.field_id === "string") {
          flush(project)
          to.setTaskField(task, project, diff.field_id, diff.value ?? null)
        } else if ("task_status" in diff) {
          flush(project)
          to.moveTask({ ...diff, task_uuid: task }, project)
        } else {
          let forProject = waiting.get(project)
          if (!forProject) waiting.set(project, (forProject = new Map()))
          forProject.set(task, { ...forProject.get(task), ...diff, task_uuid: task })
        }
        break
      }
      default:
        // A kind this app doesn't know yet: its lists read the truth again.
        rereadOnce(project)
    }
  }
  for (const project of [...waiting.keys()]) flush(project)
}

/**
 * The one catch-up. A live entry is applied at once, except while a catch-up
 * reads: then it waits, and goes after the pages unless a page held it. The
 * place moves only with what was read, never with a live entry (a message is
 * at most once: a gap behind it is only known to the log).
 */
export function createWorkFeed(deps: WorkFeedDeps, opts: { limit?: number; maxPages?: number } = {}): WorkFeed {
  const limit = opts.limit ?? WORK_PAGE
  const maxPages = opts.maxPages ?? WORK_MAX_PAGES
  let running: Promise<void> | null = null
  let again = false
  let held: WorkEntry[] = []
  let newestRead = 0

  // The log's head, kept, and every open list read again: what a place the
  // log no longer has, or too much to patch, comes to. The head is read
  // first, so what changes while the lists read comes again next time.
  const fromHead = async () => {
    const head = await deps.read("", limit)
    if (head !== "gone") await deps.saveCursor(head.cursor)
    deps.rereadAll()
  }

  const pass = async () => {
    newestRead = 0
    try {
      let cursor = await deps.loadCursor()
      if (cursor === undefined) {
        // Nothing kept on this device: what's open was just read.
        const head = await deps.read("", limit)
        if (head !== "gone") await deps.saveCursor(head.cursor)
        return
      }
      for (let page = 0; ; page++) {
        if (page >= maxPages) return await fromHead()
        const answer = await deps.read(cursor, limit)
        if (answer === "gone") return await fromHead()
        if (answer.entries.length > 0) {
          deps.apply(answer.entries)
          newestRead = Math.max(newestRead, ...answer.entries.map((e) => e.sequence))
        }
        cursor = answer.cursor
        await deps.saveCursor(cursor)
        if (answer.entries.length < limit) return
      }
    } catch {
      // Offline, or the server busy: the place is kept, and the next
      // reconnect or return to the tab goes on from it.
    } finally {
      const waiting = held.filter((e) => e.sequence > newestRead).sort((a, b) => a.sequence - b.sequence)
      held = []
      if (waiting.length > 0) deps.apply(waiting)
    }
  }

  const run = async () => {
    do {
      again = false
      await pass()
    } while (again)
    running = null
  }

  return {
    live(entry) {
      if (running) held.push(entry)
      else deps.apply([entry])
    },
    catchUp() {
      if (running) {
        again = true
        return running
      }
      running = run()
      return running
    },
  }
}

/** The log's read. A literal here, so the feed's chunk imports no endpoint table. */
export const WORK_CHANGES_PATH = "/work/changes"

/** The app's HTTP client as the feed reads with it (hooks/useWorkChanges hands it the one every page has). */
export type HttpGet = (url: string, config: { params: { cursor: string; limit: number }; silent: boolean; suppressErrorToast: boolean }) => Promise<unknown>

/**
 * The feed's read over get: the page after cursor ("" for the log's head), at
 * most limit entries, or "gone" when the log no longer has that place (410).
 * A failed catch-up keeps its place and tries again later, so it tells no one.
 */
export function readerOver(get: HttpGet): WorkFeedDeps["read"] {
  return async (cursor, limit) => {
    try {
      const res = await get(WORK_CHANGES_PATH, { params: { cursor, limit }, silent: true, suppressErrorToast: true })
      const data = (res as { data?: { data?: { entries?: WorkEntry[]; cursor?: string } } } | null)?.data?.data
      return { entries: Array.isArray(data?.entries) ? data.entries : [], cursor: typeof data?.cursor === "string" ? data.cursor : cursor }
    } catch (err) {
      if ((err as { response?: { status?: number } } | null)?.response?.status === 410) return "gone"
      throw err
    }
  }
}
