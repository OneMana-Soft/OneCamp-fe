/**
 * The Work Change Log's feed as the app runs it (projects WCL-2): the ONE
 * chunk hooks/useWorkChanges loads, on the first message or catch-up. It
 * imports only the feed's own pure code (LEAD-RULES 30 Oct: a lazy chunk
 * never reaches shared code, or the bundler cuts the shared chunks again for
 * every route): the app hands it its HTTP client, its patchers and the store
 * that keeps its place (lib/offline/workCursor, the member's Offline Store).
 */
import { applyEntries, createWorkFeed, readerOver, signalOfMessage, type HttpGet, type TaskPatchers, type WorkFeed, type WorkFeedDeps, type WorkSignal } from "@/lib/tasks/workChanges"

export interface RunningFeed {
  feed: WorkFeed
  signalOf: (data: unknown) => WorkSignal
}

/** Where the feed's place is kept: the app hands it the member's Offline Store. */
export type PlaceStore = Pick<WorkFeedDeps, "loadCursor" | "saveCursor">

/** The feed over the app's client: entries go through the newest patchers, and a re-read of everything open when told. */
export function startWorkFeed(app: { get: HttpGet; patchers: () => TaskPatchers; rereadAll: () => void; place: PlaceStore }): RunningFeed {
  return {
    signalOf: signalOfMessage,
    feed: createWorkFeed({
      read: readerOver(app.get),
      loadCursor: app.place.loadCursor,
      saveCursor: app.place.saveCursor,
      apply: (entries) => applyEntries(entries, app.patchers()),
      rereadAll: app.rereadAll,
    }),
  }
}
