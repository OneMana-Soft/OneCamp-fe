/**
 * Runs `run` while the page is on screen: at once if it is, else once, when it
 * next comes into view. A seen mark says a person looked, and nobody looks at
 * a hidden tab, so every automatic mark goes through this: the DMs'
 * (hooks/useChatReceipts) and the Inbox's (components/activity
 * activityListTabs). Returns a cancel, for an effect's cleanup.
 */
export function whenOnScreen(run: () => void): () => void {
  if (typeof document === "undefined") return () => {}
  if (document.visibilityState === "visible") {
    run()
    return () => {}
  }
  const onVisible = () => {
    if (document.visibilityState !== "visible") return
    document.removeEventListener("visibilitychange", onVisible)
    run()
  }
  document.addEventListener("visibilitychange", onVisible)
  return () => document.removeEventListener("visibilitychange", onVisible)
}
