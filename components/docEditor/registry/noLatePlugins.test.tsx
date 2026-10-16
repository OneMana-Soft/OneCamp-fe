import * as React from "react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { installRangeRects } from "@/lib/testing/rangeRects"

// No plugin is added to an editor, or taken from it, once it is open: every
// plugin is given when the editor is made (registry/factory.ts). Adding one
// later makes every plugin view again, and collaboration draws the whole doc
// again: an open "/" menu closed and a block link's flash was lost a moment
// after a doc opened, when B6's page guard added its soft lock and B9's
// overlay its AI keys (blocks.spec, 15 Oct 2026). A view that comes and goes
// (a bubble menu) attaches to the editor instead (utils/pluginView.ts).

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(async () => ({ status: 200, data: {} })), post: vi.fn(async () => ({ data: {} })) },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/late-1", useSearchParams: () => new URLSearchParams() }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => true }))
// The real bubble menu, its view attached, all but tippy's floating layer,
// whose default export doesn't come through under vitest.
vi.mock("@tiptap/extension-bubble-menu", async (original) => {
  const real = await original<typeof import("@tiptap/extension-bubble-menu")>()
  class BubbleMenuView extends real.BubbleMenuView {
    createTooltip() {}
  }
  return { ...real, BubbleMenuView }
})

const { loadBlocks } = await import("@/components/docEditor/registry/factory")
const { slotFor } = await import("@/components/docEditor/registry/registry")
const { offlineProvider } = await import("@/components/docEditor/docTestKit")
const { createTitleStore } = await import("@/components/docEditor/docTitleStore")
const { MediaQueryProvider } = await import("@/context/MediaQueryContext")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { setFacts, leaveDoc } = await import("@/components/docEditor/chrome/pageFacts")
const { aiBarOf, closeAiBar } = await import("@/components/ai/docAiStore")
const { insertSimpleTable } = await import("@/components/minimal-tiptap/extensions/simple-table/simpleTable")
const { openFind } = await import("@/components/docEditor/FindBar")
const { editorActionContext } = await import("@/components/docEditor/registry/readers")
const { default: DocInput } = await import("@/components/docEditor/docInput")

const AI = { ai: true }
const DOC = "late-1"

// The doc's blocks, and every part of the page drawn over its editor, loaded
// as the app loads them: the page guard, the AI bar's overlay, comments, the
// block menu. A part that loads later is what this holds to the rule.
beforeAll(async () => {
  await loadBlocks("doc", AI)
  await Promise.all(slotFor("editorOverlay", AI).map((c) => c.load?.()))
}, 60_000)

let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const providers: HocuspocusProvider[] = []
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  leaveDoc(DOC)
  while (providers.length) providers.pop()?.destroy()
})

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 60)))

/** The doc's page input, as the doc page draws it: its editor, its bars and every overlay. */
async function openDoc() {
  const store = configureStore({
    reducer: {
      ui: (s: Record<string, unknown> = {}) => s,
      rightPanel: (s = { rightPanelState: { data: {} } }) => s,
    },
  })
  const provider = offlineProvider(undefined, DOC)
  providers.push(provider)
  let editor: Editor | null = null
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <DocInput
            value="<p>We ship on Thursday.</p>"
            editable
            docId={DOC}
            provider={provider}
            providerSynced
            collaboration={{ enabled: true, documentId: DOC, username: "Sam Rivera", userId: "u-sam" }}
            titleStore={createTitleStore("Launch plan")}
            onEditor={(e: Editor | null) => {
              editor = e
            }}
          />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await settle()
  await settle()
  return editor!
}

describe("an open editor's plugins", () => {
  it("are the ones the doc page's editor was made with, whatever its page does", async () => {
    const added = vi.spyOn(Editor.prototype, "registerPlugin")
    const taken = vi.spyOn(Editor.prototype, "unregisterPlugin")
    const failed = vi.spyOn(console, "error")
    const editor = await openDoc()
    expect(editor).toBeTruthy()
    const plugins = editor.state.plugins
    const keys = plugins.map((p) => (p as unknown as { key: string }).key)
    // Given when it was made: the soft lock, the AI keys and pins, table editing, find.
    const has = (name: string) => keys.some((k) => k.startsWith(`${name}$`))
    expect(["b6SoftLock", "docAi", "tableColumnResizing", "docFind"].filter((name) => !has(name))).toEqual([])
    // Its bars and overlays are drawn: none added a plugin as it came.
    expect(added).not.toHaveBeenCalled()

    await act(async () => {
      editor.commands.setContent("<p>We ship on Thursday.</p><p></p>")
      editor.commands.focus("end")
    })
    // The page guard holds the editor under a soft lock, and lets it go.
    act(() => setFacts(DOC, { lock: "soft" }))
    expect(editor.isEditable).toBe(false)
    act(() => setFacts(DOC, { lock: "" }))
    expect(editor.isEditable).toBe(true)
    // Space on the empty line opens the AI bar, which its overlay draws.
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
    })
    expect(aiBarOf(editor).open).toBe(true)
    await settle()
    act(() => closeAiBar(editor))
    // A table, its editing already there.
    act(() => insertSimpleTable(editor, { from: editor.state.doc.content.size - 1, to: editor.state.doc.content.size - 1 }))
    expect(editor.getJSON().content?.some((n) => n.type === "table")).toBe(true)
    // Find.
    act(() => openFind(editorActionContext(editor, AI)))
    // A selection, with the bar over it.
    await act(async () => {
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 8)))
    })
    await settle()

    expect(added).not.toHaveBeenCalled()
    expect(taken).not.toHaveBeenCalled()
    expect(editor.state.plugins).toBe(plugins)
    // Every part of the page was drawn: none failed and left its slot empty.
    expect(failed.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("The doc contribution"))).toEqual([])
  })
})

// The same rule in the code: nothing adds or takes a plugin later, and
// Tiptap's React menus, which add one when they mount, aren't used (the
// bubble menu here attaches as a view: components/minimal-tiptap/
// components/bubble-menu/bubble-menu.tsx).
const ROOTS = ["app", "components", "context", "hooks", "lib", "services", "store"]
const LATE: Array<[RegExp, string]> = [
  [/\.(?:register|unregister)Plugin\(/, "adds or takes away a plugin while the editor is open"],
  [/\.reconfigure\(/, "reconfigures an open editor's state"],
  [/import\s*\{[^}]*\b(?:BubbleMenu|FloatingMenu)\b[^}]*\}\s*from\s*["']@tiptap\/react["']/, "Tiptap's React menus add a plugin when they mount"],
  [/\b(?:BubbleMenuPlugin|FloatingMenuPlugin)\b/, "a menu's plugin, added later"],
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(p) && !p.includes(".test.") && !p.endsWith(".d.ts") ? [p] : []
  })
}

describe("the code", () => {
  it("never adds a plugin to an editor that is open", () => {
    const found: string[] = []
    for (const file of ROOTS.flatMap(files)) {
      const src = readFileSync(file, "utf8")
      for (const [pattern, why] of LATE) {
        const m = pattern.exec(src)
        if (!m) continue
        found.push(`${relative(process.cwd(), file)}:${src.slice(0, m.index).split("\n").length}  ${why}`)
      }
    }
    expect(found).toEqual([])
  })
})
