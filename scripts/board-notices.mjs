#!/usr/bin/env node
// Writes public/board/THIRD-PARTY-NOTICES.txt, the notices for Excalidraw's
// faces that this server serves, from each face's OWN font files: their
// name tables' copyright, version, licence and licence URL, word for word
// (scripts/fontNames.mjs). Only what a file doesn't say comes from
// lib/board/vendored.json's "faces": which licence text to ship beside it,
// and, where the file names no licence, who states it. faceNotices.test
// holds the file to this output, so a package bump that brings a face with
// other terms fails a test before it ships.
//
//   node scripts/board-notices.mjs        (writes the file)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fontNames } from "./fontNames.mjs"
import { filesUnder } from "./vendor-assets.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
export const NOTICES = "public/board/THIRD-PARTY-NOTICES.txt"

const indent = (s, by = "     ") => s.replace(/\r\n?/g, "\n").trimEnd().split("\n").map((l) => (l.trim() ? by + l.trimEnd() : "")).join("\n")

export function noticesText() {
  const { packages } = JSON.parse(readFileSync(join(root, "lib/board/vendored.json"), "utf8"))
  const pkg = packages.find((p) => p.pkg === "@excalidraw/excalidraw")
  const [src, dst] = pkg.trees[0]
  const fonts = join(root, "node_modules", pkg.pkg, src)
  const byFace = new Map()
  for (const f of filesUnder(fonts)) {
    const face = f.split("/")[0]
    if (!byFace.has(face)) byFace.set(face, [])
    byFace.get(face).push(f)
  }
  const out = [
    "Third-party files OneCamp serves for boards: the faces boards draw words in.",
    "This server serves them itself, so a board never asks anyone else for them.",
    "",
    `They are the faces of ${pkg.pkg} ${pkg.version} (MIT License, as its`,
    `package.json says), copied unchanged from its ${src}/ into`,
    `${pkg.dir}/${dst}/.`,
    "Each face's copyright, version and licence below are its own font files'",
    "(their name tables), word for word; this file is written from them by",
    "scripts/board-notices.mjs.",
  ]
  let n = 0
  for (const [face, files] of [...byFace].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = pkg.faces[face]
    if (!meta) throw new Error(`board-notices: ${face} is not in lib/board/vendored.json's faces`)
    // Every file of a face says the same; if one ever doesn't, each distinct record is written.
    const records = [...new Set(files.map((f) => JSON.stringify(fontNames(join(fonts, f)))))].map((r) => JSON.parse(r))
    out.push("", `${++n}. ${face} (${pkg.dir}/${dst}/${face}/, ${files.length} file${files.length === 1 ? "" : "s"})`)
    for (const r of records) {
      if (r.version) out.push(`   Version: ${r.version}`)
      out.push("   Copyright, as the file says:", indent(r.copyright ?? "(none)"))
      if (r.licence) out.push("   Licence, as the file says:", indent(r.licence))
      if (r.licenceUrl) out.push(`   Licence URL, as the file says: ${r.licenceUrl}`)
    }
    out.push(`   Licence: ${meta.licence}${meta.statedBy ? `, as stated by ${meta.statedBy}` : ""}.`)
    if (meta.texts.length) out.push(`   Its text: ${meta.texts.join(" and ")} in this folder.`)
    if (meta.from) out.push(`   This file is ${meta.from}.`)
  }
  return out.join("\n") + "\n"
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, NOTICES), noticesText())
  console.log(`board-notices: wrote ${NOTICES}`)
}
