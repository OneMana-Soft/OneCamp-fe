import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import vendored from "./vendored.json"
import { EXCALIDRAW_ASSET_PATH } from "./excalidrawAssets"
import { filesUnder, treeHash } from "../../scripts/vendor-assets.mjs"

// A board's faces are served by this server, never fetched from esm.sh
// (Excalidraw's own default), and each one's licence is written down.

const root = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; scripts: Record<string, string> }
const excalidraw = vendored.packages.find((p) => p.pkg === "@excalidraw/excalidraw")!

describe("a board's faces", () => {
  it("are the installed package's own, at the version its folder names", () => {
    const installed = JSON.parse(read("node_modules/@excalidraw/excalidraw/package.json")) as { version: string }
    expect(installed.version).toBe(excalidraw.version)
    expect(pkg.dependencies["@excalidraw/excalidraw"]).toMatch(new RegExp(`^\\^?${excalidraw.version.replace(/\./g, "\\.")}$`))
    // The folder is named by its faces' hash: new faces, a new folder, so a browser's kept copy is never stale.
    expect(excalidraw.dir).toBe(`board/vendor/excalidraw-${excalidraw.trees[0][2].slice(0, 8)}`)
    // An upgrade that moved or changed a face fails here, not on someone's board.
    for (const [from, to, sha256] of excalidraw.trees) {
      const dir = join(root, "node_modules/@excalidraw/excalidraw", from)
      expect(existsSync(dir), from).toBe(true)
      expect(treeHash(dir), from).toBe(sha256)
      expect(to).toBe("fonts")
    }
    // Excalidraw's notes are Excalifont; its files are among them.
    const faces = filesUnder(join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts")) as string[]
    expect(faces.some((f) => /^Excalifont\/.+\.woff2$/.test(f))).toBe(true)
  })

  it("are where Excalidraw looks for them, set before Excalidraw loads by everything that renders it", () => {
    expect(EXCALIDRAW_ASSET_PATH).toBe(`/${excalidraw.dir}/`)
    expect(window.EXCALIDRAW_ASSET_PATH).toBe(EXCALIDRAW_ASSET_PATH)
    for (const file of ["components/board/boardCanvas.tsx", "components/guest/GuestBoardViewer.tsx"]) {
      const src = read(file)
      const set = src.indexOf('import "@/lib/board/excalidrawAssets"')
      expect(set, file).toBeGreaterThan(-1)
      expect(set, file).toBeLessThan(src.indexOf('import("@excalidraw/excalidraw")'))
    }
  })

  it("are copied before every build and dev server, kept out of git, and kept by the browser for good", () => {
    expect(pkg.scripts.build).toMatch(/^node scripts\/vendor-assets\.mjs && next build/)
    expect(pkg.scripts.dev).toMatch(/^node scripts\/vendor-assets\.mjs && next dev/)
    expect(read("scripts/vendor-assets.mjs")).toContain('"lib/board/vendored.json"')
    expect(read(".gitignore")).toContain("/public/board/vendor/")
    const config = read("next.config.ts")
    expect(config).toContain('source: "/board/vendor/:path*"')
  })

  it("each have their licence written down beside them", () => {
    const notices = read("public/board/THIRD-PARTY-NOTICES.txt")
    // Each face's own terms: faceNotices.test.
    expect(notices).toContain(`${excalidraw.pkg} ${excalidraw.version}`)
    expect(notices).toContain(`${excalidraw.dir}/fonts/`)
  })
})
