import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getSchema } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Transform } from "@tiptap/pm/transform"
import {
  applyPlaced,
  childrenOf,
  diffBlocks,
  locate,
  nodesKey,
  validHunks,
} from "./core"

/**
 * core.js is the collaboration service's live/ops/proposalCore.js byte for
 * byte: a suggestion accepted here and one accepted from a list on the server
 * must leave the same doc. Change both copies, then this pin and the service's
 * (live/ops/proposalCore.test.js), to the same value.
 */
const CORE_SHA256 = "714f796322ae01c638239284110c4f34f16943dec1fcb3449ec7a91930459f6f"

const schema = getSchema([StarterKit])
const t = (text: string, marks?: { type: string }[]) => (marks ? { type: "text", text, marks } : { type: "text", text })
const p = (...texts: (string | ReturnType<typeof t>)[]) => ({
  type: "paragraph",
  content: texts.map((x) => (typeof x === "string" ? t(x) : x)),
})
const blocks = (...b: object[]) => b.map((x) => schema.nodeFromJSON(x))

function applyAll(base: ReturnType<typeof blocks>, proposed: ReturnType<typeof blocks>, ids?: string[]) {
  const hunks = diffBlocks(base, proposed)
  const doc = schema.nodeFromJSON({ type: "doc", content: base.map((b) => b.toJSON()) })
  const r = locate(doc, { from: 0, to: doc.content.size }, base.map((b) => b.toJSON()), hunks, ids ?? null, null)
  const tr = new Transform(doc)
  applyPlaced(tr, r.placed)
  return { hunks, doc: tr.doc, ...r }
}

describe("the proposals core", () => {
  it("is the collaboration service's copy, byte for byte", () => {
    const sha = createHash("sha256").update(readFileSync(join(__dirname, "core.js"))).digest("hex")
    expect(sha, "core.js changed: copy it to live/ops/proposalCore.js in the backend, and update both pins").toBe(CORE_SHA256)
  })

  it("cuts a rewritten sentence into word changes and applies any of them", () => {
    const base = blocks(p("The quick brown fox jumps over the dog."))
    const proposed = blocks(p("The slow brown fox leaps over the lazy dog."))
    const all = applyAll(base, proposed)
    expect(all.hunks.map((h) => [h.level, h.op])).toEqual([
      ["inline", "replace"],
      ["inline", "replace"],
      ["inline", "insert"],
    ])
    expect(validHunks(base, all.hunks)).toBe(true)
    expect(nodesKey(childrenOf(all.doc))).toBe(nodesKey(proposed))
    const some = applyAll(base, proposed, ["h1", "h3"])
    expect(some.doc.textContent).toBe("The slow brown fox jumps over the lazy dog.")
  })

  it("swaps, inserts and removes blocks, marks included", () => {
    const base = blocks({ type: "heading", attrs: { level: 2 }, content: [t("Plan")] }, p("Ship Thursday."), p("Old note."))
    const proposed = blocks(
      { type: "heading", attrs: { level: 3 }, content: [t("Plan")] },
      p("Ship ", t("Friday", [{ type: "bold" }]), "."),
      p("Celebrate."),
    )
    expect(nodesKey(childrenOf(applyAll(base, proposed).doc))).toBe(nodesKey(proposed))
  })

  it("refuses hunks that do not match their base", () => {
    const base = blocks(p("Ship Thursday."))
    const hunks = diffBlocks(base, blocks(p("Ship Friday.")))
    expect(validHunks(base, hunks.map((h) => ({ ...h, before: [t("Monday")] })))).toBe(false)
  })
})
