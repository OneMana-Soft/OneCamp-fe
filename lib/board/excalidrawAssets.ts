// Where Excalidraw fetches its faces (Excalifont for notes, and the rest).
// With no asset path of its own it asks esm.sh, a third party, on every
// board: a self-hosted install with no way out drew notes in a fallback face,
// a slow line kept a note's words blank until the face came, and each
// visitor's address went to esm.sh. scripts/vendor-assets.mjs copies the
// package's own faces (vendored.json) into public/ before every build; the
// folder is named by the faces' hash, and each file by its own, so it is cached for good.
//
// Imported for its effect by every module that renders Excalidraw
// (boardCanvas, GuestBoardViewer) before Excalidraw loads, so its faces,
// exports included, come from here. No shared core and no imports: a leaf.

/**
 * Excalidraw resolves "fonts/<face>/<file>.woff2" against this: vendored.json's
 * folder, written out so the board's first load doesn't carry the manifest
 * (excalidrawAssets.test holds the two together).
 */
export const EXCALIDRAW_ASSET_PATH = "/board/vendor/excalidraw-e65d316c/"

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH
