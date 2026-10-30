// The app's side of lib/chunkRecovery's one probe: a chunk failure the app caught
// asks the early script (window.__ocChunk, lib/chunkRecoveryScript) whether to
// reload into a new build, and work a reload would lose holds it off. Small on
// purpose: every lazy piece reaches this file through lib/loadChunk, so it
// carries none of the probe's constants or prose (lib/chunkRecovery has those).

/** The early script's side of the page (window.__ocChunk): its one probe, and the work that holds a reload off. */
export interface ChunkRecovery {
  /** Reloads once into the new build when the server says `url` is gone (404, 410); true when the page reloads now. */
  reloadIfGone(url: string | null): Promise<boolean>
  /** The file a chunk error names, or null. */
  urlOf(cause: unknown): string | null
  /** Each true while the page holds work a reload would lose. */
  held: Array<() => boolean>
}

declare global {
  interface Window {
    __ocChunk?: ChunkRecovery
  }
}

const recovery = (): ChunkRecovery | undefined => (typeof window === "undefined" ? undefined : window.__ocChunk)

/**
 * A chunk that failed to load and that the app caught (a lazy part, the error
 * page): reloads once into the new build when the server says the file the
 * failure names is gone, through the early script's one probe. True when the
 * page reloads now; false for anything else (a failure that names no file of
 * the app's code, no network, no answer in CHUNK_PROBE_MS, the file still
 * there, a reload in the last CHUNK_RELOAD_GUARD_MS, or work held, when the
 * reload comes once it is sent), and the caller says what failed.
 */
export function reloadForNewBuild(cause: unknown): Promise<boolean> {
  const r = recovery()
  return r ? r.reloadIfGone(r.urlOf(cause)) : Promise.resolve(false)
}

/**
 * Holds off the reload a new build asks for while `pending()` says this page
 * holds work a reload would lose: a live doc's or board's edits the server
 * hasn't confirmed (lib/collabSession), a settings bar's unsaved changes
 * (lib/unsavedChanges). Returns the release.
 */
export function holdReload(pending: () => boolean): () => void {
  const held = recovery()?.held
  if (!held) return () => {}
  held.push(pending)
  return () => {
    const at = held.indexOf(pending)
    if (at >= 0) held.splice(at, 1)
  }
}
