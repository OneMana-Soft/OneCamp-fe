import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { useMinimalTiptapEditor } from "./use-minimal-tiptap"

// Typing in a long doc cost a full render of the editor's frame and an HTML
// copy of the whole document on every key. These pin both down: a host that
// follows the editor itself renders once, not once per key, and the document
// is turned into HTML only when someone is listening, at most once a throttle.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let current: Editor | null = null

function Host({ rerender, onUpdate, throttleDelay = 0, onRender }: { rerender?: boolean; onUpdate?: (v: unknown) => void; throttleDelay?: number; onRender: () => void }) {
  const editor = useMinimalTiptapEditor({
    value: "<p>Start</p>",
    onUpdate,
    throttleDelay,
    ...(rerender === undefined ? {} : { shouldRerenderOnTransaction: rerender }),
  })
  current = editor as unknown as Editor | null
  onRender()
  return null
}

async function mount(props: Omit<React.ComponentProps<typeof Host>, "onRender">) {
  let renders = 0
  render(<Host {...props} onRender={() => renders++} />)
  // The editor is created after the first render (immediatelyRender: false).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  expect(current).toBeTruthy()
  return { renders: () => renders, editor: current! }
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    act(() => {
      editor.commands.insertContent(ch)
    })
  }
}

describe("typing in a minimal-tiptap editor", () => {
  it("renders a host that follows the editor itself once, not once per key", async () => {
    const { renders, editor } = await mount({ rerender: false })
    const before = renders()
    type(editor, "twenty characters...")
    expect(renders() - before).toBeLessThanOrEqual(1)
  })

  it("still renders the default host on every transaction, for the composers that read the editor while rendering", async () => {
    const { renders, editor } = await mount({})
    const before = renders()
    type(editor, "ten chars!")
    expect(renders() - before).toBeGreaterThanOrEqual(10)
  })

  it("never turns the document into HTML when nobody listens for it", async () => {
    const getHTML = vi.spyOn(Editor.prototype, "getHTML")
    const { editor } = await mount({ rerender: false })
    getHTML.mockClear()
    type(editor, "no listener here")
    expect(getHTML).not.toHaveBeenCalled()
  })

  it("turns it into HTML at most once a throttle, not on every key, and hands over the latest text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const getHTML = vi.spyOn(Editor.prototype, "getHTML")
      const seen: unknown[] = []
      const { editor } = await mount({ rerender: false, throttleDelay: 3000, onUpdate: (v) => seen.push(v) })
      getHTML.mockClear()
      type(editor, "abcdefghij")
      // The first key goes out at once, the rest wait for the throttle.
      expect(getHTML.mock.calls.length).toBeLessThanOrEqual(1)
      await act(async () => {
        vi.advanceTimersByTime(3100)
      })
      expect(getHTML.mock.calls.length).toBeLessThanOrEqual(2)
      expect(String(seen.at(-1))).toContain("abcdefghij")
    } finally {
      vi.useRealTimers()
    }
  })
})
