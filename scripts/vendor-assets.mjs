#!/usr/bin/env node
// Copies the files the browser loads at run time out of node_modules into
// public/, so a self-hosted server serves them itself and nobody's visit asks
// a third party for them:
//   - lib/calls/processors/vendored.json: the call effects' files (MediaPipe's
//     own defaults are a CDN and Google's storage, while someone is on camera);
//   - lib/board/vendored.json: Excalidraw's faces (its own default is esm.sh,
//     on every board).
// Each package's folder names its version. A file carries its sha256; a whole
// folder ("trees") carries one sha256 of its files' paths and sha256s, sorted
// (treeHash below). Runs before every build and dev server (package.json);
// copies only what is missing or changed, and fails, naming the file, when a
// package no longer has one (an upgrade that moved it) or has a different
// one, rather than build without it or with it.
//
//   node scripts/vendor-assets.mjs
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const MANIFESTS = ["lib/calls/processors/vendored.json", "lib/board/vendored.json"]

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")

/** Every file under dir, as paths relative to it with "/" between parts, sorted. */
export const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => p.split(sep).join("/"))
    .sort()

/** One sha256 for a folder: of each file's path and sha256, one per line, sorted by path. */
export const treeHash = (dir) =>
  createHash("sha256")
    .update(filesUnder(dir).map((p) => `${p}\t${sha256(join(dir, p))}\n`).join(""))
    .digest("hex")

const fail = (msg) => {
  console.error(`vendor-assets: ${msg}`)
  process.exit(1)
}

function copy(a, b) {
  if (existsSync(b) && statSync(b).size === statSync(a).size && statSync(b).mtimeMs >= statSync(a).mtimeMs) return 0
  mkdirSync(dirname(b), { recursive: true })
  copyFileSync(a, b)
  return 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  for (const manifest of MANIFESTS) {
    const { packages } = JSON.parse(readFileSync(join(root, manifest), "utf8"))
    let copied = 0
    for (const p of packages) {
      const from = join(root, "node_modules", p.pkg)
      const installed = JSON.parse(readFileSync(join(from, "package.json"), "utf8")).version
      if (installed !== p.version) fail(`${p.pkg} is ${installed} here and ${p.version} in ${manifest}; change ${manifest} (and its folder) with the package`)
      for (const [src, dst, want] of p.files ?? []) {
        const a = join(from, src)
        if (!existsSync(a)) fail(`${p.pkg}@${installed} has no ${src}`)
        // A package changed under the same version is not served.
        const got = sha256(a)
        if (got !== want) fail(`${p.pkg}@${installed} ${src} is not the file ${manifest} names (sha256 ${got}, expected ${want})`)
        copied += copy(a, join(root, "public", p.dir, dst))
      }
      for (const [src, dst, want] of p.trees ?? []) {
        const a = join(from, src)
        if (!existsSync(a)) fail(`${p.pkg}@${installed} has no ${src}/`)
        const got = treeHash(a)
        if (got !== want) fail(`${p.pkg}@${installed} ${src}/ is not the folder ${manifest} names (tree sha256 ${got}, expected ${want})`)
        for (const f of filesUnder(a)) copied += copy(join(a, f), join(root, "public", p.dir, dst, f))
      }
    }
    if (copied) console.log(`vendor-assets: ${copied} file${copied === 1 ? "" : "s"} copied for ${relative(root, join(root, manifest))}`)
  }
}
