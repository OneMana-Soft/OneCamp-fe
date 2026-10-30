// The one delayed address writer; its rules: app/delayedNavigation.test.ts.
import { waiting } from "./appRouter"

export function addressLater(write: () => void, ms: number): () => void {
  const page = location.pathname
  const now = () => {
    stop()
    if (location.pathname == page) write()
  }
  const key = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (!t.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (/^(Enter| )$/.test(e.key) || e.metaKey || e.ctrlKey || e.altKey)) now()
  }
  const on: [string, EventListener, boolean?][] = [["pointerdown", now, true], ["keydown", key as EventListener, true], ["popstate", stop], ["pagehide", now]]
  const timer = setTimeout(now, ms)
  waiting.add(now)
  on.forEach(([type, f, capture]) => addEventListener(type, f, capture))
  function stop() {
    clearTimeout(timer)
    waiting.delete(now)
    on.forEach(([type, f, capture]) => removeEventListener(type, f, capture))
  }
  return stop
}
