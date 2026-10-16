// Recovering from a deploy. A page loaded before a new build asks for the old
// build's code files; they're gone, the load fails, and the app showed "a
// client-side exception has occurred" until the person reloaded by hand. On
// a chunk that fails to load, the page reloads itself once and gets the new
// build. A stylesheet that fails to load is the same case, and left the page
// unstyled; a font that fails is not, so only stylesheets count. The guard
// stops a loop if the files really are missing. Offline, a chunk that fails
// is the network, not a deploy: a reload would show the browser's offline
// page and lose what the page holds (a doc's edits made offline), so the
// page is left as it is.

const KEY = "oc_chunk_reload_at"
export const CHUNK_RELOAD_GUARD_MS = 30_000

/** Whether an error is a code chunk that failed to load. Pure. */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  const text = `${e?.name ?? ""} ${e?.message ?? String(err ?? "")}`
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Loading CSS chunk/i.test(text)
}

/** Reloads once per guard window; false when it already did. */
export function reloadForNewBuild(now = Date.now()): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (now - last < CHUNK_RELOAD_GUARD_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    /* storage blocked: still worth one reload */
  }
  location.reload()
  return true
}

/**
 * The same, as a script that runs before the app does (root layout), so a
 * failure while the app itself is loading is caught too.
 */
export const CHUNK_RECOVERY_SCRIPT = `(function(){var K=${JSON.stringify(KEY)},G=${CHUNK_RELOAD_GUARD_MS};function again(){if(navigator.onLine===false)return;try{var t=+sessionStorage.getItem(K)||0;if(Date.now()-t<G)return;sessionStorage.setItem(K,String(Date.now()))}catch(e){}location.reload()}
window.addEventListener("error",function(e){var t=e.target,b=/\\/_next\\/static\\//;if(t&&((t.tagName==="SCRIPT"&&b.test(t.src||""))||(t.tagName==="LINK"&&t.rel==="stylesheet"&&b.test(t.href||""))))again()},true);
window.addEventListener("unhandledrejection",function(e){var r=e.reason,m=String((r&&(r.name+" "+r.message))||r||"");if(/ChunkLoadError|Loading chunk [\\w-]+ failed|Failed to load chunk|Loading CSS chunk/i.test(m))again()})})();`
