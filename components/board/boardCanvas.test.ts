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
    const skip = change.indexOf("if (signature === lastSignatureRef.current) return")
    expect(skip).toBeGreaterThan(0)
    expect(change.indexOf("storeWithMakers(yAuthors, yElements as never, sceneNow")).toBeGreaterThan(skip)
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
    // The sync's once-more, inside the remote-change guard.
    const applies = [...src.matchAll(/if \(applyShared\(api, yElements\.values\(\) as never\) > 0\) markRemoteMerge\(\)/g)]
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

  it("starts from the empty scene's fingerprint, so Excalidraw's first call is no change", () => {
    expect(src).toMatch(/const lastSignatureRef = React\.useRef\(sceneSignature\(\[\]\)\)/)
  })
})

