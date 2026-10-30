// Recovering from a deploy. A page loaded before a new build asks for the old
// build's code files; they're gone, the load fails, and the app showed "a
// client-side exception has occurred" until the person reloaded by hand. On
// a chunk that fails to load, the page reloads itself once and gets the new
// build. A stylesheet that fails to load is the same case, and left the page
// unstyled; a font that fails is not, so only stylesheets count. The guard
// stops a loop if the files really are missing.
//
// Only when the server says that code is gone (V-64, 29 Oct). A chunk fails
// with no network too, and the device may still say it is online (Wi-Fi with
// no internet, a dead cell link): the reload then threw the page away, with
// what it held (a fresh doc, and every key typed into it after). So the file
// that failed is asked for again (HEAD, never from the cache, CHUNK_PROBE_MS
// at most), and only a 404 or a 410 reloads. No answer, a slow one, or the
// file there after all leaves the page as it is, except a boot file (one that
// failed before the page's load event, which the page can't run without):
// there after all, it reloads too. And a reload that is due waits while the
// page holds work it would lose (holdReload).
//
// One probe for the page: the early script (lib/chunkRecoveryScript, in the
// root layout, so a failure while the app itself loads is caught too) answers
// every <script> or stylesheet that fails and every chunk error nobody caught,
// and the app's own catches ask it through reloadForNewBuild (lib/newBuild).

export const CHUNK_RELOAD_KEY = "oc_chunk_reload_at"
export const CHUNK_RELOAD_GUARD_MS = 30_000
/** How long the failed file's probe may take: no answer by then is the network, not a deploy. */
export const CHUNK_PROBE_MS = 4_000
/** How often a reload that waits on held work looks again. */
export const CHUNK_HELD_POLL_MS = 1_000

/** A code chunk's load failure, as webpack and Turbopack word it. */
export const CHUNK_ERROR = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Loading CSS chunk/i
/** The app's own code and stylesheets. */
export const STATIC_FILE = /\/_next\/static\//
/** The file a chunk error names. */
export const CHUNK_FILE = /\/_next\/static\/[^\s"'()]+/

/** Whether an error is a code chunk that failed to load. Pure. */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  return CHUNK_ERROR.test(`${e?.name ?? ""} ${e?.message ?? String(err ?? "")}`)
}
