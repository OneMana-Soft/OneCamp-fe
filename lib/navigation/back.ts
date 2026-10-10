/**
 * Back, on a phone: the previous screen in the app, or the screen above this
 * one when there is none.
 *
 * Every back arrow called router.back(). Opened from a notification, a link in
 * an email or a fresh launch of the installed app, there is nothing behind the
 * page in this app: back left the app, or did nothing at all in a new window,
 * and the arrow was a dead end. Channels pushed their parent instead, which
 * added a history entry each time, so the system back gesture then returned
 * to the channel that had just been left.
 *
 * So the app counts how deep into its own history it is (followHistory, run
 * by the layout), and the arrow goes back while there is somewhere in the app
 * to go back to, and to the page's parent (parentPath) when there is not.
 * The count errs low: a forward step or a replace it cannot tell apart is
 * read as no history, and the arrow then goes up a level, which is never out
 * of the app.
 */

/** The screen above this one: a thread's channel, a task's list, a list's Home. Pure. */
export function parentPath(pathname: string): string {
  const seg = (pathname || "").split(/[?#]/)[0].split("/").filter(Boolean)
  if (seg[0] !== "app" || seg.length < 2) return "/app/home"
  const [, section, a, b, c] = seg
  switch (section) {
    case "home":
      return "/app/home"
    case "channel":
      // /channel/{id}/{post} and /channel/{id}/recording go to the channel.
      return b ? `/app/channel/${a}` : a ? "/app/channel" : "/app/home"
    case "chat":
      if (a === "group") return c ? `/app/chat/group/${b}` : "/app/chat"
      return b ? `/app/chat/${a}` : a ? "/app/chat" : "/app/home"
    case "doc":
      return b ? `/app/doc/${a}` : a ? "/app/doc" : "/app/home"
    case "task":
    case "create":
      return "/app/myTask"
    case "meet":
      // A call goes back to its conversation.
      if (a === "ch" && b) return `/app/channel/${b}`
      if (a === "chat" && b) return `/app/chat/${b}`
      if (a === "grp" && b) return `/app/chat/group/${b}`
      return "/app/home"
    case "forward":
    case "user":
      return "/app/home"
    default:
      // A page under a section (a project, a team, a board, a table, a goal,
      // an event, a settings page) goes to the section; a section to Home.
      if (section === "calendar" && a === "event") return "/app/calendar"
      return a ? `/app/${section}` : "/app/home"
  }
}

let depth = 0
let lastLength = -1
let popped = false
let following = false

/** How many screens back the app's own history goes. */
export function inAppDepth(): number {
  return depth
}

/** Starts counting. Idempotent; the layout calls it once. */
export function followHistory(win: Pick<Window, "history" | "addEventListener"> = window): void {
  if (following) return
  following = true
  lastLength = win.history.length
  win.addEventListener("popstate", () => {
    popped = true
  })
}

/** Called on every new pathname, after the router has updated history. */
export function noteRouteChange(win: Pick<Window, "history"> = window): void {
  const length = win.history.length
  if (popped) {
    // Back (or, rarely, forward: then the count is low, which is safe).
    popped = false
    depth = Math.max(0, depth - 1)
  } else if (lastLength >= 0 && length > lastLength) {
    depth += length - lastLength
  }
  // Same length and no popstate: a replace. The depth stays.
  lastLength = length
}

/** For tests: as a fresh page load. */
export function resetHistoryForTest(): void {
  depth = 0
  lastLength = -1
  popped = false
  following = false
}

interface BackRouter {
  back: () => void
  replace: (href: string) => void
}

/** Goes back within the app, or up to the page's parent when the app has no history. */
export function goBack(router: BackRouter, pathname: string): void {
  if (depth > 0) router.back()
  else router.replace(parentPath(pathname))
}
