import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The canvas's sync with the shared document, read from its source (it needs
// Excalidraw and a socket to run). lib/board/scene tests the two pieces.
const src = readFileSync(join(__dirname, "boardCanvas.tsx"), "utf8")
const effect = (marker: string) => src.slice(src.indexOf(marker), src.indexOf("}, [", src.indexOf(marker)) + 80)

describe("the board canvas", () => {
  it("puts the drawing and the camera on the scene only once Excalidraw has loaded it", () => {
    expect(src).toMatch(/whenSceneReady\(\(\) => api\.getAppState\(\)\.isLoading/)
    expect(effect("if (!api || !sceneReady) return")).toMatch(/hydrateFromY\(\)/)
    expect(src).toMatch(/if \(!api \|\| !synced \|\| !sceneReady\) return/)
    expect(src).toMatch(/if \(!api \|\| !sceneReady \|\| viewportRestoredRef\.current\) return/)
  })
})
