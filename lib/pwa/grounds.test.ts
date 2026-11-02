import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import { GROUND, THEME_COLOR_METAS, groundFor } from "./grounds"
import { MANIFEST } from "./manifests"
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

  // Android launches an installed app on its manifest's colours, and Chrome
  // (since August 2026) paints the app's navigation bar with its theme_color.
  // Chrome reads no dark pair from a manifest (user_preferences stays for a
  // browser that does), so a dark app sat over a white bar (V-322, the
  // owner's phone, 2 Nov 2026). Each mode has its own manifest: the same app
  // on that mode's ground, and the boot script links the one for the mode
  // shown (lib/appBoot). The light one keeps the address installed apps were
  // made from.
  it("is each mode's manifest's colours: the same app, on that mode's ground", () => {
    expect(MANIFEST.light, "the address installed apps were made from").toBe("/manifest.json")
    for (const scheme of ["light", "dark"] as const) {
      expect(existsSync(join(ROOT, "public", MANIFEST[scheme])), `the ${scheme} manifest ships`).toBe(true)
    }
    const shipped = (scheme: "light" | "dark") => JSON.parse(readFileSync(join(ROOT, "public", MANIFEST[scheme]), "utf8"))
    for (const scheme of ["light", "dark"] as const) {
      const { background_color, theme_color } = shipped(scheme)
      expect({ background_color, theme_color }, scheme).toEqual({ background_color: GROUND[scheme].phone, theme_color: GROUND[scheme].phone })
    }
    const app = (scheme: "light" | "dark") => ({ ...shipped(scheme), background_color: "", theme_color: "" })
    expect(app("dark"), "the same app in every other member").toEqual(app("light"))
    expect(app("light").id, "one id: the same installed app").toBe("/")
    expect(app("light").user_preferences?.color_scheme?.dark).toEqual({ background_color: GROUND.dark.phone, theme_color: GROUND.dark.phone })
  })
})
