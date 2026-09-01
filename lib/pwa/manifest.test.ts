import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

import { oklchToRgb, parseOklch, rgbToHex } from "@/lib/color/oklch"

/**
 * The light app shell colour, DERIVED from the token rather than written down.
 *
 * Hardcoding it here meant the test asserted a hex that had to be updated by
 * hand every time the ground changed, which is a guard that fails for the wrong
 * reason. Computing it means the test enforces the invariant it actually cares
 * about: the manifest equals --background, whatever --background becomes.
 */
function lightShell(): string {
  const css = readFileSync(resolve(__dirname, "..", "..", "app", "globals.css"), "utf8")
  const root = css.slice(css.indexOf(":root {"))
  const m = /--background:\s*([^;]+);/.exec(root)
  if (!m) throw new Error("could not find --background in the light theme")
  const parsed = parseOklch(m[1].trim())
  if (!parsed) throw new Error(`--background is not oklch: ${m[1]}`)
  return rgbToHex(oklchToRgb(parsed.l, parsed.c, parsed.h))
}

/**
 * These assert the PWA icons are what the manifest CLAIMS they are, by reading
 * the actual PNG bytes.
 *
 * The bug that motivated them: two icons were declared `purpose: "any maskable"`
 * while being ~76% transparent with a transparent centre. A maskable icon gets
 * composited into a platform-chosen shape (circle, squircle, rounded square) on
 * the assumption that the artwork fills the canvas, so on Android the launcher
 * drew OneCamp as a thin ring floating on whatever sat behind the mask. Nothing
 * in a type-check or a build can notice that — the manifest is just JSON, and the
 * PNG is just bytes — which is exactly why it survived.
 *
 * So the rules a reviewer can't eyeball are pinned here: maskable icons must
 * carry no alpha channel, declared sizes must match the real pixel dimensions,
 * and every referenced file must exist.
 */

const root = resolve(__dirname, "../..")
const publicDir = resolve(root, "public")

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

const manifest = JSON.parse(
  readFileSync(resolve(publicDir, "manifest.json"), "utf8"),
) as { icons: ManifestIcon[]; theme_color: string; background_color: string }

/** PNG colour types that carry an alpha channel. */
const ALPHA_COLOUR_TYPES = new Set([4, 6])

function readPngHeader(absPath: string) {
  const buf = readFileSync(absPath)
  const signature = buf.subarray(0, 8).toString("latin1")
  expect(signature).toBe("\x89PNG\r\n\x1a\n")
  // IHDR is always the first chunk: width, height, bit depth, colour type.
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colourType: buf.readUInt8(25),
    hasTransparencyChunk: buf.includes(Buffer.from("tRNS")),
  }
}

const pngIcons = manifest.icons.filter((i) => i.type === "image/png")
const maskableIcons = manifest.icons.filter((i) => (i.purpose || "any").split(/\s+/).includes("maskable"))

describe("PWA manifest icons", () => {
  it("references only files that exist", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(publicDir, icon.src.replace(/^\//, "")))).toBe(true)
    }
  })

  it("declares sizes that match the real PNG dimensions", () => {
    for (const icon of pngIcons) {
      const { width, height } = readPngHeader(resolve(publicDir, icon.src.replace(/^\//, "")))
      expect(`${width}x${height}`, `${icon.src} dimensions`).toBe(icon.sizes)
    }
  })

  it("ships at least one maskable icon, and every maskable icon is fully opaque", () => {
    // A maskable icon with transparency renders as art floating in the mask.
    expect(maskableIcons.length).toBeGreaterThan(0)
    for (const icon of maskableIcons) {
      expect(icon.type, `${icon.src} should be a raster PNG to be reliably maskable`).toBe("image/png")
      const png = readPngHeader(resolve(publicDir, icon.src.replace(/^\//, "")))
      expect(
        ALPHA_COLOUR_TYPES.has(png.colourType),
        `${icon.src} must not have an alpha channel (colour type ${png.colourType})`,
      ).toBe(false)
      expect(png.hasTransparencyChunk, `${icon.src} must not carry a tRNS chunk`).toBe(false)
    }
  })

  it("covers both maskable sizes launchers ask for", () => {
    const sizes = maskableIcons.map((i) => i.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
  })

  it("keeps the splash colours equal to the light app shell", () => {
    // Matching both keeps the install splash from flashing a colour the app
    // never shows. The expected value comes from --background itself, so this
    // stays true through a palette change instead of needing one more edit.
    const shell = lightShell()
    expect(manifest.theme_color.toLowerCase()).toBe(shell)
    expect(manifest.background_color.toLowerCase()).toBe(shell)
  })

  it("ships an opaque apple-touch-icon PNG, since iOS ignores SVG", () => {
    const png = readPngHeader(resolve(publicDir, "apple-touch-icon.png"))
    expect(png.width).toBe(180)
    expect(png.height).toBe(180)
    expect(ALPHA_COLOUR_TYPES.has(png.colourType)).toBe(false)
  })
})
