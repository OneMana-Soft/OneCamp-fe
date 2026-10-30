import { app_task_path } from "@/types/paths"

/**
 * A TASK OPENS IN PLACE WITH NO NETWORK (asana-12 (a), main 29 Oct 2026).
 *
 * A move to a task's page needs the network: the app has no app-shell
 * service worker yet (V-81), so with none the browser shows its own offline
 * page in the app's place. A phone opens a task on its page, so offline it
 * couldn't open one at all, not even one it had just made. While the browser
 * is offline, a task opens over the page instead, in the right panel, as a
 * laptop opens it (a sheet on a phone), and nothing moves.
 *
 * ONE rule for every way a task opens: TaskInPlace asks it of a link's press
 * (before Next's Link moves) and of a move in code (appRouter's push and
 * replace).
 */
const TASK_PAGE = new RegExp(`^${app_task_path}/([^/]+)/?$`)

/** The task a move to `href` opens in place, or null: online, another site, or not a task's page. */
export function taskInPlace(href: string, online: boolean, here: string): string | null {
  if (online) return null
  try {
    const to = new URL(href, here)
    const page = to.origin === new URL(here).origin ? TASK_PAGE.exec(to.pathname) : null
    return page ? decodeURIComponent(page[1]) : null
  } catch {
    // Not an address, or not a task's id: the browser's to move to.
    return null
  }
}
