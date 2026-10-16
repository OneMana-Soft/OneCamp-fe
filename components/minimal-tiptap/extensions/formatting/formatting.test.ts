import { describe, expect, it } from "vitest"

import "@/components/docEditor/registry"
import "./register"
import { actionById, blockById, dialogFor, slotFor } from "@/components/docEditor/registry/registry"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS } from "@/components/docEditor/registry/manifest"
import { shortcutRowsFor } from "@/components/docEditor/registry/shortcuts"

// B2's formatting registers with its chunk, which loads with a doc's editor
// (I20): before that, only the shortcut dialog's rows are here.

const gate = { ai: false }
const ids = () => ({
  blocks: ["blockColor", "highlight", "toc", "listFormat", "quoteSize", "colourSlash"].filter((id) => blockById(id)),
  actions: ["colour.open", "listFormat.1", "listFormat.a", "listFormat.i", "quote.large"].filter((id) => actionById(id, gate)),
  dialogs: ["doc.colour"].filter((id) => dialogFor(id, gate)),
  slots: [...slotFor("more", gate), ...slotFor("editorOverlay", gate)].map((s) => `${s.slot}:${s.id}`).filter((s) => s.endsWith("doc.outline")),
})

describe("B2's formatting", () => {
  it("before a doc's editor loads its blocks: the shortcuts' rows only", () => {
    expect(ids()).toEqual({ blocks: [], actions: [], dialogs: [], slots: [] })
    expect(blockById("formatting")?.load).toBeTypeOf("function")
    expect(shortcutRowsFor("doc", gate).map((r) => r.label)).toEqual(expect.arrayContaining(["Last colour used", "Highlight", "Lettered or roman list"]))
  })

  it("once they have loaded: its blocks, actions, dialogs and slots, for docs alone", async () => {
    await loadBlocks("doc", ALL_EDITIONS)
    expect(ids()).toEqual({
      blocks: ["blockColor", "highlight", "toc", "listFormat", "quoteSize", "colourSlash"],
      actions: ["colour.open", "listFormat.1", "listFormat.a", "listFormat.i", "quote.large"],
      dialogs: ["doc.colour"],
      slots: ["editorOverlay:doc.outline"],
    })
    for (const id of ["blockColor", "highlight", "toc", "listFormat", "quoteSize"]) expect(blockById(id)?.editors, id).toEqual(["doc", "guest"])
  }, 30_000)
})
