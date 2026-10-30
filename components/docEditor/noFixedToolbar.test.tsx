import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { offlineProvider } from "./docTestKit"
import { createTitleStore } from "./docTitleStore"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"

// content.md D08: a doc has no formatting row. At rest the page is the title
// and the text; formatting floats on a selection (the selection bar) and a
// phone docks a bar above its keyboard. The real doc input, rendered: a
// toolbar row put back into it (the comment composer's, say) fails here.

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
    default: { get: vi.fn(async () => ({ status: 200, data: {} })), post: vi.fn(async () => ({ data: {} })) },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/d" }))
// The floating shell, in place (lib/testing/bubbleMenu): shown when the
// menu's own shouldShow says so, after every transaction.
vi.mock("@/components/minimal-tiptap/components/bubble-menu/bubble-menu", () => import("@/lib/testing/bubbleMenu"))

import DocInput from "./docInput"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

let restoreRects = () => {}
beforeAll(() => {
    restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const providers: HocuspocusProvider[] = []
afterEach(() => {
    cleanup()
    while (providers.length) providers.pop()?.destroy()
})

async function renderDoc() {
    const store = configureStore({
        reducer: {
            ui: (s: Record<string, unknown> = {}) => s,
            rightPanel: (s = { rightPanelState: { data: {} } }) => s,
        },
    })
    const provider = offlineProvider()
    providers.push(provider)
    let editor: Editor | null = null
    render(
        <Provider store={store}>
            <MediaQueryProvider>
                <TooltipProvider>
                    <DocInput
                        value="<p>select me</p>"
                        editable
                        docId="d"
                        provider={provider}
                        providerSynced
                        collaboration={{ enabled: true, documentId: "d", username: "Sam Rivera", userId: "u-sam" }}
                        titleStore={createTitleStore("Launch sync notes")}
                        onEditor={(e: Editor | null) => {
                            editor = e
                        }}
                    />
                </TooltipProvider>
            </MediaQueryProvider>
        </Provider>,
    )
    await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
    })
    await act(async () => {
        editor!.commands.setContent("<p>select me</p>")
        editor!.commands.focus("end")
    })
    return editor!
}

describe("a doc's formatting", () => {
    it("has no toolbar at rest: the title, then the text", async () => {
        await renderDoc()
        expect(screen.queryAllByRole("toolbar")).toEqual([])
        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
    })

    it("floats one bar on a selection, outside the page's frame", async () => {
        const editor = await renderDoc()
        await act(async () => {
            editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })
            await new Promise((r) => setTimeout(r, 50))
        })
        const bars = screen.queryAllByRole("toolbar")
        expect(bars).toHaveLength(1)
        expect(bars[0].getAttribute("aria-label")).toBe("Formatting")
        expect(bars[0].closest("[data-bubble-menu]")).toBeTruthy()
    })
})
