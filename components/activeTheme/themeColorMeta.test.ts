import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { chromeToken } from "./ThemeColorMeta"
import { SPLASH_DEVICES, splashLinks } from "@/lib/pwa/splash"

// The installed app's status area and launch screen (design v3, mobile PWA polish).

const ROOT = join(__dirname, "..", "..")

describe("the browser's bar", () => {
  it("continues the phone's top bar (the sheet), and the frame from 640px", () => {
    expect(chromeToken(390, "")).toBe("--sheet")
    expect(chromeToken(639, "")).toBe("--sheet")
    expect(chromeToken(640, "")).toBe("--canvas")
    expect(chromeToken(1440, "")).toBe("--canvas")
  })

  it("goes black while a large sheet pushes the page back as a card", () => {
    // vaul paints the body black behind the scaled page.
    expect(chromeToken(390, "black")).toBe("black")
    expect(chromeToken(390, "rgb(0, 0, 0)")).toBe("black")
  })
})

function pngSize(file: string): [number, number] {
  const b = readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe("the launch screen", () => {
  it("has a light and a dark image for every current iPhone, each its screen's exact size", () => {
    const links = splashLinks()
    expect(links).toHaveLength(SPLASH_DEVICES.length * 2)
    for (const { href, media } of links) {
      const file = join(ROOT, "public", href)
      expect(existsSync(file), href).toBe(true)
      const [, w, h] = href.match(/-(\d+)x(\d+)\.png$/)!.map(Number)
      expect(pngSize(file), href).toEqual([w, h])
      expect(media).toMatch(/\(prefers-color-scheme: (light|dark)\)/)
      expect(media).toMatch(/-webkit-device-pixel-ratio: [23]/)
    }
  })

  it("is the frame's colour, so the app's splash follows with no seam", () => {
    // A flat image is a tiny file; anything drawn on it would not be.
    for (const { href } of splashLinks()) {
      expect(readFileSync(join(ROOT, "public", href)).length, href).toBeLessThan(40_000)
    }
  })

  it("is linked from the root layout", () => {
    expect(readFileSync(join(ROOT, "app/layout.tsx"), "utf8")).toMatch(/rel="apple-touch-startup-image"/)
  })
})
