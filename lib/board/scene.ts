/**
 * Two facts about an Excalidraw scene that the board's sync needs, kept pure
 * so they can be tested without a canvas.
 */

interface Versioned {
  version?: number
  versionNonce?: number
}

/**
 * A cheap fingerprint of a scene's elements: how many, and their versions.
 * Excalidraw bumps an element's version (and draws a new nonce) on every
 * change to it, deletion included, and calls onChange for camera moves too,
 * once a frame while someone pans. Comparing fingerprints tells a pan (same
 * fingerprint: nothing to send) from an edit, without walking the shared
 * document for every element on every frame.
 */
export function sceneSignature(elements: readonly Versioned[]): string {
  let versions = 0
  let nonces = 0
  for (const el of elements) {
    versions += el.version ?? 0
    nonces = (nonces + (el.versionNonce ?? 0)) | 0
  }
  return `${elements.length}:${versions}:${nonces}`
}

/**
 * Calls onReady once the scene has finished loading, checking once a frame.
 * Returns a function that stops waiting.
 *
 * WHY. Excalidraw loads its own scene asynchronously after it mounts (its
 * initialData), and when that finishes it replaces every element with what it
 * loaded: for a board, nothing. A board whose drawing arrived from the
 * collaboration server before that moment was painted and then wiped, and
 * opened blank, with the "Start from a template" card over a board that had
 * a drawing. Anything put on the scene has to wait for this.
 */
export function whenSceneReady(
  isLoading: () => boolean,
  onReady: () => void,
  frame: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
): () => void {
  let id = 0
  let stopped = false
  const check = () => {
    if (stopped) return
    if (!isLoading()) {
      stopped = true
      onReady()
      return
    }
    id = frame(check)
  }
  check()
  return () => {
    stopped = true
    if (id) cancel(id)
  }
}
