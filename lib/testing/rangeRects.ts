/**
 * jsdom lays nothing out: a Range has no getClientRects or
 * getBoundingClientRect. ProseMirror measures one whenever it scrolls the
 * caret into view: after a key, and in the frame after an editor is focused
 * (tiptap's focus command scrolls in a requestAnimationFrame). Without rects
 * that frame throws outside the test's own call stack, so the run fails as
 * an unhandled error, often after the test that focused the editor had passed.
 *
 * An editor test that focuses, types or scrolls installs this stand-in for
 * its file, and puts back what was there after:
 *
 *   let restoreRects = () => {}
 *   beforeAll(() => {
 *     restoreRects = installRangeRects()
 *   })
 *   afterAll(() => restoreRects())
 *
 * It is opt-in, never in vitest.setup.ts: installed for every test, it lets
 * ProseMirror's scrolling run on in tests that never asked for it, which
 * moves their timing (imageUploads' read of a progress bar failed 2 runs in
 * 3 that way). The rects are empty, as for a collapsed or hidden range in a
 * browser; a test that places something by the text (a link's card) passes
 * the one box every range has. Where jsdom (or another stand-in) already has
 * them, nothing is changed.
 */
export function installRangeRects(box?: { x: number; y: number; width: number; height: number }): () => void {
  if (typeof Range === "undefined") return () => {}
  const proto = Range.prototype as unknown as Record<string, unknown>
  const rect = () => (box ? new DOMRect(box.x, box.y, box.width, box.height) : new DOMRect())
  const added: string[] = []
  if (typeof proto.getClientRects !== "function") {
    proto.getClientRects = function getClientRects(): DOMRectList {
      const rects = box ? [rect()] : []
      return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList
    }
    added.push("getClientRects")
  }
  if (typeof proto.getBoundingClientRect !== "function") {
    proto.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
      return rect()
    }
    added.push("getBoundingClientRect")
  }
  return () => {
    for (const name of added) delete proto[name]
  }
}
