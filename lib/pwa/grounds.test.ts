import { readFileSync } from "node:fs"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import { GROUND, THEME_COLOR_METAS, groundFor } from "./grounds"
import { splashLinks } from "./splash"

// The ground the app starts on (17 Oct 2026, the splash): every start
// surface paints these four colours, and each must be the token it stands
// for, or the hand-over from one surface to the next shows a seam. A dark
// app that launched on white was exactly such a seam.

const ROOT = join(__dirname, "..", "..")

/** A token's value in the light (:root) or dark (.dark) block of globals.css, lower-cased hex. */
function token(name: string, scheme: "light" | "dark"): string {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
  const head = scheme === "light" ? ":root {" : "\n.dark {"
  const start = css.indexOf(head)
  const block = css.slice(start, css.indexOf("\n}", start))
  const m = new RegExp(`\\s--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block)
  if (!m) throw new Error(`--${name} is not a hex in the ${scheme} block`)
  return m[1].toLowerCase()
}

/** Every pixel's colour in a PNG we wrote (8-bit RGB, no interlace), as a set of hexes. */
function pngColours(file: string): Set<string> {
  const b = readFileSync(file)
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  expect(b.readUInt8(24), `${file}: 8-bit`).toBe(8)
  expect(b.readUInt8(25), `${file}: RGB`).toBe(2)
  const chunks: Buffer[] = []
  for (let i = 8; i < b.length; ) {
    const len = b.readUInt32BE(i)
    const type = b.toString("latin1", i + 4, i + 8)
    if (type === "IDAT") chunks.push(b.subarray(i + 8, i + 8 + len))
    i += 12 + len
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 3 + 1
  const colours = new Set<string>()
  let prev = Buffer.alloc(width * 3)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride]
    const row = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride))
    for (let x = 0; x < row.length; x++) {
      const left = x >= 3 ? row[x - 3] : 0
      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + prev[x]) & 255
      else expect(filter, `${file}: filter ${filter} on row ${y}`).toBe(0)
    }
    // Every row of a flat image is the same; reading three a row is enough.
    for (const x of [0, Math.floor(width / 2), width - 1]) {
      colours.add("#" + [row[x * 3], row[x * 3 + 1], row[x * 3 + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""))
    }
    prev = row
  }
  return colours
}

describe("the ground the app starts on", () => {
  it("is the sheet on a phone and the frame from 640px, light and dark, as the tokens say", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(GROUND[scheme].phone, `${scheme} phone`).toBe(token("sheet", scheme))
      expect(GROUND[scheme].wide, `${scheme} wide`).toBe(token("frame", scheme))
    }
    expect(groundFor(false, 390)).toBe(GROUND.light.phone)
    expect(groundFor(true, 639)).toBe(GROUND.dark.phone)
    expect(groundFor(true, 640)).toBe(GROUND.dark.wide)
    expect(groundFor(false, 1440)).toBe(GROUND.light.wide)
  })

  // Before the stylesheet arrives the browser paints the page's canvas, white
  // unless the page says it has a dark scheme too.
  it("lets the browser paint the canvas dark before the stylesheet arrives", () => {
    expect(readFileSync(join(ROOT, "app/layout.tsx"), "utf8")).toMatch(/\bcolorScheme: "light dark"/)
  })

  it("gives the browser's bar a phone's ground before any code runs: dark, then the rest", () => {
    expect(THEME_COLOR_METAS.map((m) => m.color)).toEqual([GROUND.dark.phone, GROUND.light.phone])
    expect(THEME_COLOR_METAS[0].media).toBe("(prefers-color-scheme: dark)")
    expect(THEME_COLOR_METAS.at(-1)?.media, "the last one is the fallback, with no media").toBeUndefined()
  })

  // The installed app's launch screen on iOS is a phone's: the sheet. It was
  // the frame, so the launch went grey, then white as the app took over.
  it("is what every iOS launch image is painted with, and nothing else", () => {
    for (const { href } of splashLinks()) {
      const scheme = href.includes("/dark-") ? "dark" : "light"
      expect([...pngColours(join(ROOT, "public", href))], href).toEqual([GROUND[scheme].phone])
    }
  })

  // Android launches an installed app on the manifest's colours. They are a
  // phone's, light; a browser that honours the manifest's dark colours (the
  // user_preferences member, Chromium's web app dark mode) gets the dark ones.
  it("is the manifest's launch colours, light and dark", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "public/manifest.json"), "utf8"))
    expect(manifest.background_color).toBe(GROUND.light.phone)
    expect(manifest.theme_color).toBe(GROUND.light.phone)
    expect(manifest.user_preferences?.color_scheme?.dark).toEqual({ background_color: GROUND.dark.phone, theme_color: GROUND.dark.phone })
  })
})
