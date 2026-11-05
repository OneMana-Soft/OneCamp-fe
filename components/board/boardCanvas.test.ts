import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The canvas's sync with the shared document, read from its source (it needs
// Excalidraw and a socket to run). lib/board/scene tests the two pieces.
const src = readFileSync(join(__dirname, "boardCanvas.tsx"), "utf8")
const effect = (marker: string) => src.slice(src.indexOf(marker), src.indexOf("}, [", src.indexOf(marker)) + 80)

describe("the board canvas", () => {
  it("puts the drawing and the camera on the scene only once Excalidraw has loaded it", () => {
    expect(src).toMatch(/const sceneReady = useSceneReady\(api\)/)
    expect(effect("if (!api || !sceneReady) return")).toMatch(/followShared\(api, yElements as unknown as SharedElements/)
    expect(src).toMatch(/if \(!api \|\| !synced \|\| !sceneReady\) return/)
    expect(src).toMatch(/if \(!api \|\| !sceneReady \|\| viewportRestoredRef\.current\) return/)
  })

  it("sends nothing, and schedules no thumbnail, for a pan or a zoom", () => {
    const change = src.slice(src.indexOf("const handleChange = React.useCallback("))
    const skip = change.indexOf("if (signature === lastSignatureRef.current || privateHolds()) return")
    expect(skip).toBeGreaterThan(0)
    expect(change.indexOf("storeWithMakers(yAuthors, yElements as never, scene,")).toBeGreaterThan(skip)
    expect(change.indexOf("scheduleThumbnail()")).toBeGreaterThan(skip)
  })

  it("takes what others drew as seen, so opening a board sends nothing back and uploads no thumbnail", () => {
    // Both places that put the shared drawing on the canvas do it through the
    // one binding (lib/board/binding: outside the person's undo history), and
    // remember its fingerprint right after. Following the document (W-4): each
    // merge marks the canvas, then remembers.
    const follow = effect("if (!api || !sceneReady) return")
    const merged = follow.slice(follow.indexOf("onMerged: () => {"))
    expect(merged.indexOf("markRemoteMerge()")).toBeGreaterThan(0)
    expect(merged.indexOf("lastSignatureRef.current = sceneSignature(api.getSceneElementsIncludingDeleted() as never)")).toBeGreaterThan(merged.indexOf("markRemoteMerge()"))
    expect(src).not.toMatch(/hydrateFromY/)
    // The sync's once-more, inside the remote-change guard (private mode's author keeps the words: miro-25).
    const applies = [...src.matchAll(/if \(applyShared\(api, yElements\.values\(\) as never(, \(remote\) => privateRef\.current\?\.inbound\(remote\) \?\? remote)?\) > 0\) markRemoteMerge\(\)/g)]
    expect(applies).toHaveLength(1)
    for (const a of applies) {
      const before = src.slice(Math.max(0, a.index! - 400), a.index!)
      expect(before.lastIndexOf("applyingRemoteRef.current = true")).toBeGreaterThan(-1)
      const after = src.slice(a.index!, a.index! + 700)
      const remember = after.search(/lastSignatureRef\.current = sceneSignature\((api\.getSceneElementsIncludingDeleted\(\)|scene) as never\)/)
      expect(remember).toBeGreaterThan(0)
      expect(remember).toBeLessThan(after.indexOf("applyingRemoteRef.current = false"))
    }
  })

  it("marks the canvas once the server's drawing is on it, for tests and measurements", () => {
    const synced = effect("if (!api || !synced || !sceneReady) return")
    expect(synced).toMatch(/mark\.dataset\.boardSynced = "true"/)
    expect(synced).toMatch(/mark\.dataset\.boardElements = String\(liveCount\(scene as never\)\)/)
    expect(src).toMatch(/<div ref=\{wrapRef\} className="relative h-full w-full" data-board-canvas="">/)
    // A teammate's change that reached the scene moves data-board-remote.
    expect(src).toMatch(/wrapRef\.current\.dataset\.boardRemote = String\(remoteMergesRef\.current\)/)
  })

  it("leaves a board that opens at a frame to the caller that puts the camera on it, as a link's ?frame= is", () => {
    // A call's slide (components/livekit/stageSlides): a first visit with no saved camera doesn't frame the whole drawing over it.
    const firstFit = effect("// No saved camera")
    expect(firstFit).toMatch(/if \(linkedRef\.current \|\| opensAt\) \{\s+viewportRestoredRef\.current = true\s+return\s+\}/)
    expect(firstFit).toMatch(/\}, \[api, sceneReady, synced, boardId, opensAt\]\)/)
  })

  it("starts from the empty scene's fingerprint, so Excalidraw's first call is no change", () => {
    expect(src).toMatch(/const lastSignatureRef = React\.useRef\(sceneSignature\(\[\]\)\)/)
  })

  // Private mode (miro-25): while a running round waits for its code, nothing of the scene leaves the tab.
  it("sends no thumbnail while private mode's code comes under a running round, and sends others' view after", () => {
    const thumb = src.slice(src.indexOf("const captureThumbnail = React.useCallback("), src.indexOf("const scheduleThumbnail"))
    expect(thumb).toMatch(/if \(!api \|\| !editable \|\| privateHolds\(\)\) return/)
    expect(thumb).toContain("elements: privateRef.current?.outward(els) ?? els,")
  })

  it("loads private mode only when its gate wants it, and sends the write it held once its code is in", () => {
    expect(src).toMatch(/const PrivateNotesHost = lazyPiece\(\(\) => import\("@\/components\/board\/privateNotesHost"\)\)/)
    expect(src).toMatch(/\{privateWanted && \(\s+<React\.Suspense fallback=\{null\}>\s+<PrivateNotesHost/)
    expect(src).toContain("onReady={() => apiRef.current && handleChange(apiRef.current.getSceneElementsIncludingDeleted()")
  })
})

