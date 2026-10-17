import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { TooltipProvider } from "@/components/ui/tooltip"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SD-27, SD-BUG-2, MC-25: "(edited)" showed only on bodies drawn without the
// editor, so an edited message holding code, an image or a table, and every
// edited thread reply, read as untouched.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")
const { editedTitle } = await import("@/lib/chat/editedMark")
const { addChannelComments, updateChannelCommentByCommentUUID } = await import("@/store/slice/channelCommentSlice")

afterEach(cleanup)

const TITLE = "Edited 10:42 · originally 10:31"
const body = (content: string, title?: string) =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput isOutputText output="html" content={content} editedTitle={title} />
      </TooltipProvider>
    </Provider>,
  )

describe("(edited) on a message", () => {
  it("follows a body only the editor can draw", async () => {
    const { container } = body("<p>Run this:</p><pre><code>make verify</code></pre>", TITLE)
    const mark = await waitFor(() => container.querySelector<HTMLElement>("[data-edited-after] .msg-edited")!)
    expect(mark.textContent).toBe("(edited)")
    expect(mark.title).toBe(TITLE)
  })

  it("ends a plain body's last line, once", () => {
    const { container } = body("<p>Numbers are in</p>", TITLE)
    expect(container.querySelectorAll(".msg-edited")).toHaveLength(1)
    expect(container.querySelector("[data-edited-after]")).toBeNull()
  })

  it("is absent from a body never changed", async () => {
    const { container } = body("<p>Run this:</p><pre><code>make verify</code></pre>")
    await waitFor(() => expect(container.querySelector(".ProseMirror")).toBeTruthy())
    expect(container.querySelector(".msg-edited")).toBeNull()
  })
})

describe("when a message or a reply was edited", () => {
  it("says both times, and nothing for a save within a second of the send", () => {
    expect(editedTitle("2026-10-14T09:00:00Z", "2026-10-14T09:00:00.800Z")).toBeUndefined()
    expect(editedTitle("2026-10-14T09:00:00Z", undefined)).toBeUndefined()
    expect(editedTitle(undefined, "2026-10-14T09:05:00Z")).toBeUndefined()
    expect(editedTitle("2026-10-14T09:00:00Z", "2026-10-14T09:05:00Z")).toMatch(/^Edited .+ · originally .+$/)
  })

  it("holds a reply's edit with the time it was made", () => {
    store.dispatch(addChannelComments({ postId: "p1", comments: [{ comment_uuid: "c1", comment_text: "<p>typo</p>", comment_created_at: "2026-10-14T09:00:00Z" } as never] }))
    store.dispatch(updateChannelCommentByCommentUUID({ postId: "p1", commentUUID: "c1", htmlText: "<p>fixed</p>", updatedAt: "2026-10-14T09:05:00Z" }))
    const reply = store.getState().channelComment.postComments["p1"][0]
    expect(reply).toMatchObject({ comment_text: "<p>fixed</p>", comment_updated_at: "2026-10-14T09:05:00Z" })
  })
})
