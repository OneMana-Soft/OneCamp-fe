import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import vendored from "./vendored.json"
import { RNNOISE, SEGMENTER_MODEL, SEGMENTER_MODEL_SHA256, VISION_FILESET } from "./assets"

// The files the call effects load are served by this server, never fetched
// from anyone else's (MediaPipe's defaults are a CDN and Google's storage),
// and each one's licence is written down beside it.

const root = join(__dirname, "..", "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; scripts: Record<string, string> }

describe("the call effects' files", () => {
  it("are the installed packages' own, at the versions package.json pins", () => {
    for (const p of vendored.packages) {
      expect(pkg.dependencies[p.pkg], p.pkg).toBe(p.version)
      const installed = JSON.parse(read(`node_modules/${p.pkg}/package.json`)) as { version: string }
      expect(installed.version, p.pkg).toBe(p.version)
      expect(p.dir, p.pkg).toBe(`calls/vendor/${p.pkg.split("/").pop()}@${p.version}`)
      // An upgrade that moved a file, or a package changed under the same
      // version, fails here, not in someone's call.
      for (const [from, , sha256] of p.files) {
        const file = join(root, "node_modules", p.pkg, from)
        expect(existsSync(file), `${p.pkg}/${from}`).toBe(true)
        expect(createHash("sha256").update(readFileSync(file)).digest("hex"), `${p.pkg}/${from}`).toBe(sha256)
      }
    }
  })

  it("are where the processors look for them", () => {
    const out = (pkgName: string) => vendored.packages.find((p) => p.pkg === pkgName)!
    const vision = out("@mediapipe/tasks-vision")
    expect(VISION_FILESET).toBe(`/${vision.dir}`)
    // MediaPipe's FilesetResolver asks for these four by name, SIMD or not.
    expect(vision.files.map(([, to]) => to).sort()).toEqual(["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"])
    const noise = out("@sapphi-red/web-noise-suppressor")
    for (const url of Object.values(RNNOISE)) expect(noise.files.map(([, to]) => `/${noise.dir}/${to}`)).toContain(url)
  })

  it("are copied before every build and dev server, and kept out of git", () => {
    expect(pkg.scripts.build).toMatch(/^node scripts\/calls-assets\.mjs && next build/)
    expect(pkg.scripts.dev).toMatch(/^node scripts\/calls-assets\.mjs && next dev/)
    expect(read(".gitignore")).toContain("/public/calls/vendor/")
  })

  it("are kept by the browser for good, since each path names its version or hash", () => {
    const config = read("next.config.ts")
    expect(config).toContain('source: "/calls/:dir(vendor|models)/:path*"')
    expect(config).toContain("public, max-age=31536000, immutable")
  })

  it("include the segmenter's model, unchanged since it was downloaded", () => {
    const model = readFileSync(join(root, "public", SEGMENTER_MODEL))
    expect(createHash("sha256").update(model).digest("hex")).toBe(SEGMENTER_MODEL_SHA256)
    expect(SEGMENTER_MODEL).toContain(SEGMENTER_MODEL_SHA256.slice(0, 8))
  })

  it("each have their licence written down beside them", () => {
    const notices = read("public/calls/THIRD-PARTY-NOTICES.txt")
    for (const p of vendored.packages) {
      expect(notices, p.pkg).toContain(`${p.pkg.split("/").pop()} ${p.version}`.replace("tasks-vision", "MediaPipe Tasks Vision"))
      expect(notices).toContain(p.dir.replace(/^calls\//, "calls/"))
    }
    expect(notices).toContain("Apache License, Version 2.0")
    expect(notices).toContain(SEGMENTER_MODEL_SHA256)
    // RNNoise's own terms, which a binary of it must carry.
    expect(notices).toContain("Redistribution and use in source and binary forms")
    expect(read("public/calls/LICENSE-APACHE-2.0.txt")).toContain("Apache License")
  })

  it("are never asked of anyone else's server", () => {
    for (const file of ["lib/calls/processors/background.ts", "lib/calls/processors/noise.ts"]) {
      const src = read(file)
      expect(src, file).not.toMatch(/https?:\/\//)
    }
    expect(read("lib/calls/processors/background.ts")).toContain("assetPaths: { tasksVisionFileSet: VISION_FILESET, modelAssetPath: SEGMENTER_MODEL }")
  })
})
