#!/usr/bin/env node
// Copies the files the call effects load at run time out of node_modules into
// public/, so a self-hosted server serves them itself: MediaPipe's own defaults
// would fetch them from a CDN and Google's storage while someone is on camera.
// The list is lib/calls/processors/vendored.json; each package's folder names
// its version and each file its sha256. Runs before every build and dev
// server (package.json); copies only what is missing or changed, and fails,
// naming the file, when a package no longer has one (an upgrade that moved
// it) or has a different one, rather than build without it or with it.
//
//   node scripts/calls-assets.mjs
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { packages } = JSON.parse(readFileSync(join(root, "lib/calls/processors/vendored.json"), "utf8"))

let copied = 0
for (const p of packages) {
  const from = join(root, "node_modules", p.pkg)
  const installed = JSON.parse(readFileSync(join(from, "package.json"), "utf8")).version
  if (installed !== p.version) {
    console.error(`calls-assets: ${p.pkg} is ${installed} here and ${p.version} in vendored.json; change vendored.json (and its folder) with the package`)
    process.exit(1)
  }
  for (const [src, dst, sha256] of p.files) {
    const a = join(from, src)
    const b = join(root, "public", p.dir, dst)
    if (!existsSync(a)) {
      console.error(`calls-assets: ${p.pkg}@${installed} has no ${src}`)
      process.exit(1)
    }
    // A package changed under the same version is not served.
    const got = createHash("sha256").update(readFileSync(a)).digest("hex")
    if (got !== sha256) {
      console.error(`calls-assets: ${p.pkg}@${installed} ${src} is not the file vendored.json names (sha256 ${got}, expected ${sha256})`)
      process.exit(1)
    }
    if (existsSync(b) && statSync(b).size === statSync(a).size && statSync(b).mtimeMs >= statSync(a).mtimeMs) continue
    mkdirSync(dirname(b), { recursive: true })
    copyFileSync(a, b)
    copied++
  }
}
if (copied) console.log(`calls-assets: ${copied} file${copied === 1 ? "" : "s"} copied into public/calls/vendor`)
