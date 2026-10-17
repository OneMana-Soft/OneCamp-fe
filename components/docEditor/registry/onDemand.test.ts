import { beforeAll, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { allBlocks } from "./registry"
import { extensionsFor, loadBlocks } from "./factory"
import { ALL_EDITIONS, bareContext } from "./manifest"
import { STAND_IN_PROPS, fetchOnDemand } from "./onDemand"

// A block's plugins on demand stand in from the editor's creation, and a
// stand-in passes on only the props it knows and the DOM events its block
// declares (a view listens for what its plugins name when it is made). A
// chunk whose plugins use another (a library update) would work silently in
// part: this holds every chunk to what its stand-ins carry.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

describe("plugins on demand", () => {
  const blocks = allBlocks().filter((b) => b.onDemand)

  it("has its first block: table editing", () => {
    expect(blocks.map((b) => b.id)).toContain("simpleTableEditing")
  })

  it("give, per block, the plugins it declares, using only what their stand-ins pass on", async () => {
    const editor = new Editor({ extensions: extensionsFor(bareContext("doc", ALL_EDITIONS)) })
    try {
      for (const block of blocks) {
        const od = block.onDemand!
        const chunk = await fetchOnDemand(block.id, od)
        const plugins = chunk.plugins(editor)
        expect(plugins, block.id).toHaveLength(od.plugins)
        for (const p of plugins) {
          const props = p.spec.props ?? {}
          const named = Object.keys(props).filter((k) => !(k === "nodeViews" && Object.keys(props.nodeViews ?? {}).length === 0))
          expect(named.filter((k) => !STAND_IN_PROPS.includes(k)), `${block.id}: props its stand-in doesn't pass on`).toEqual([])
          const events = Object.keys(props.handleDOMEvents ?? {})
          expect(events.filter((t) => !od.events.includes(t)), `${block.id}: DOM events it doesn't declare`).toEqual([])
        }
        // A node of its kind, written in a saved copy, is what its pattern reads.
        for (const type of od.nodes) expect(editor.schema.nodes[type], `${block.id}: ${type}`).toBeTruthy()
      }
    } finally {
      editor.destroy()
    }
  })
})
