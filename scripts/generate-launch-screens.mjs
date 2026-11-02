#!/usr/bin/env node
// The installed app's launch screens, from the tokens.
//
//   node scripts/generate-launch-screens.mjs
//
// iOS shows an apple-touch-startup-image while a home-screen app starts, and
// Android shows the manifest's background_color (and theme_color in the
// status bar and, since August 2026, the navigation bar). Both are the
// ground the app starts on (lib/pwa/grounds): a phone's, the sheet, light and
// dark. They were hand-made, and the iOS images were the frame's grey, so a
// launch went grey and then white as the app took over. This writes them from
// app/globals.css, the one source:
//   - public/splash/{light,dark}-WxH.png for every iPhone in lib/pwa/splash.ts,
//     flat, so the splash's own glow and scene arrive on them with no seam
//     (Apple's guidance too: a launch screen is the first screen, unbranded);
//   - the two manifests lib/pwa/manifests' MANIFEST names: the same app, each on
//     its mode's ground. Chrome reads no dark pair from a manifest, so a dark
//     app needs its own (V-322); the boot script links the one for the mode
//     shown. Both keep the dark pair under user_preferences.color_scheme.dark
//     for a browser that reads it.
// lib/pwa/grounds.test.ts fails when any of them drifts from the tokens: run
// this after changing --sheet.
//
// Plain Node, no image library: a flat PNG is an IHDR, one deflated IDAT and
// an IEND.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/** A token's hex in the light (:root) or dark (.dark) block of globals.css. */
function token(name, scheme) {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
  const head = scheme === "light" ? ":root {" : "\n.dark {"
  const start = css.indexOf(head)
  const block = css.slice(start, css.indexOf("\n}", start))
  const m = new RegExp(`\\s--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block)
  if (!m) throw new Error(`--${name} is not a hex in the ${scheme} block of app/globals.css`)
  return m[1].toLowerCase()
}

/** The iPhones lib/pwa/splash.ts links launch images for: { width, height, ratio }. */
function devices() {
  const src = readFileSync(join(ROOT, "lib/pwa/splash.ts"), "utf8")
  const list = [...src.matchAll(/\{\s*width:\s*(\d+),\s*height:\s*(\d+),\s*ratio:\s*(\d)\s*\}/g)].map((m) => ({
    width: Number(m[1]),
    height: Number(m[2]),
    ratio: Number(m[3]),
  }))
  if (list.length === 0) throw new Error("no devices found in lib/pwa/splash.ts")
  return list
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A flat RGB PNG of one colour. The first row is written out; every other is "Up" (all zeros), which deflates to almost nothing. */
function flatPng(width, height, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  raw[0] = 0
  for (let x = 0; x < width; x++) {
    raw[1 + x * 3] = r
    raw[2 + x * 3] = g
    raw[3 + x * 3] = b
  }
  for (let y = 1; y < height; y++) raw[y * stride] = 2
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(2, 9) // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const ground = { light: token("sheet", "light"), dark: token("sheet", "dark") }

for (const { width, height, ratio } of devices()) {
  for (const scheme of ["light", "dark"]) {
    const [w, h] = [width * ratio, height * ratio]
    const file = join(ROOT, "public/splash", `${scheme}-${w}x${h}.png`)
    writeFileSync(file, flatPng(w, h, ground[scheme]))
    console.log(`public/splash/${scheme}-${w}x${h}.png  ${ground[scheme]}`)
  }
}

/** The manifest's address in each mode, as lib/pwa/manifests.ts's MANIFEST names them: { light, dark }. */
function manifests() {
  const src = readFileSync(join(ROOT, "lib/pwa/manifests.ts"), "utf8")
  const m = /MANIFEST = \{ light: "(\/[\w.-]+\.json)", dark: "(\/[\w.-]+\.json)" \}/.exec(src)
  if (!m) throw new Error("no MANIFEST addresses found in lib/pwa/manifests.ts")
  return { light: m[1], dark: m[2] }
}

const at = manifests()
const manifest = JSON.parse(readFileSync(join(ROOT, "public", at.light), "utf8"))
manifest.user_preferences = { color_scheme: { dark: { background_color: ground.dark, theme_color: ground.dark } } }
for (const scheme of ["light", "dark"]) {
  const app = { ...manifest, background_color: ground[scheme], theme_color: ground[scheme] }
  writeFileSync(join(ROOT, "public", at[scheme]), JSON.stringify(app, null, 2) + "\n")
  console.log(`public${at[scheme]}  ${ground[scheme]}`)
}
