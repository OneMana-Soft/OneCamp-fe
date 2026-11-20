import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { TooltipProvider } from "@/components/ui/tooltip"

// The comment composer (B7): one line that grows, ⌘↵ sends and Return starts
// a new line, Esc lets go, @ and attach only; an error is said under the words,
// which stay (N46); Send waits for a file still uploading (N41).

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ upload_limit_mb: 10, upload_limit_bytes: 10 * 1024 * 1024 }) }))
vi.mock("@/lib/utils/file/getMediaDimensions", () => ({ getMediaDimensions: async () => ({ width: 0, height: 0 }) }))
vi.mock("@/components/attachments/attachmentIcon", () => ({ AttachmentIcon: () => <span /> }))
const uploaded: Array<(id: string) => void> = []
vi.mock("./docCommentApi", () => ({
    uploadCommentFile: () => new Promise<string>((ok) => uploaded.push(ok)),
}))

const { CommentComposer, CommentFoot } = await import("./CommentComposer")
type Sent = { body: string; attachments: { attachment_uuid: string }[] }
const sender = (impl: (b: Sent) => Promise<unknown> = async () => undefined) => vi.fn(impl)

afterEach(() => {
    cleanup()
    uploaded.length = 0
})

function compose(onSend = sender(), onCancel?: () => void) {
    render(
        <TooltipProvider>
            <CommentComposer docId="d1" placeholder="Reply…" label="Reply in this thread" sendLabel="Reply" onSend={onSend} onCancel={onCancel} />
        </TooltipProvider>,
    )
    return onSend
}

/** The composer's editor, once built. */
async function editor(): Promise<Editor> {
    let ed: Editor | undefined
    await waitFor(() => {
        ed = (document.querySelector(".ProseMirror") as unknown as { editor?: Editor } | null)?.editor
        expect(ed).toBeTruthy()
    })
    return ed!
}

const text = () => document.querySelector(".ProseMirror")!

describe("the comment composer", () => {
    it("sends with ⌘↵, and starts a new line with Return", async () => {
        const onSend = compose()
        const ed = await editor()
        act(() => {
            ed.commands.insertContent("Ship it")
        })
        fireEvent.keyDown(text(), { key: "Enter" })
        expect(onSend).not.toHaveBeenCalled()
        fireEvent.keyDown(text(), { key: "Enter", metaKey: true })
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
        expect(onSend.mock.calls[0][0]).toMatchObject({ body: expect.stringContaining("Ship it"), attachments: [] })
        // Sent: an empty composer for the next one.
        await waitFor(() => expect(ed.isEmpty).toBe(true))
    })

    it("sends nothing when there is nothing to send", async () => {
        const onSend = compose()
        await editor()
        fireEvent.keyDown(text(), { key: "Enter", ctrlKey: true })
        await new Promise((r) => setTimeout(r, 20))
        expect(onSend).not.toHaveBeenCalled()
    })

    it("lets go with Esc where it may be dropped", async () => {
        const onCancel = vi.fn()
        compose(undefined, onCancel)
        await editor()
        fireEvent.keyDown(text(), { key: "Escape" })
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it("says what went wrong under the words, which stay", async () => {
        const onSend = compose(sender(async () => Promise.reject(new Error("You can view this, but not comment on it."))))
        const ed = await editor()
        act(() => {
            ed.commands.insertContent("Keep me")
        })
        fireEvent.keyDown(text(), { key: "Enter", metaKey: true })
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "You can view this, but not comment on it.")
        expect(onSend).toHaveBeenCalledTimes(1)
        expect(ed.getText()).toBe("Keep me")
    })

    it("waits for a file still uploading, then sends it with the words (N41)", async () => {
        const onSend = compose()
        const ed = await editor()
        act(() => {
            ed.commands.insertContent("See the plan")
        })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        await act(async () => {
            fireEvent.change(input, { target: { files: [new File(["x"], "plan.pdf", { type: "application/pdf" })] } })
        })
        await waitFor(() => expect(uploaded).toHaveLength(1))
        fireEvent.keyDown(text(), { key: "Enter", metaKey: true })
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A file is still uploading. Send when it's attached.")
        expect(onSend).not.toHaveBeenCalled()

        await act(async () => uploaded[0]("u-plan"))
        fireEvent.keyDown(text(), { key: "Enter", metaKey: true })
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
        expect(onSend.mock.calls[0][0].attachments.map((a) => a.attachment_uuid)).toEqual(["u-plan"])
    })

    it("reads as ready to send with only a file attached, and not before it is", async () => {
        compose()
        await editor()
        const send = () => screen.getByRole("button", { name: /Reply|Wait for the upload/ })
        expect(send().className).toContain("bg-press")
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        await act(async () => {
            fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } })
        })
        await waitFor(() => expect(uploaded).toHaveLength(1))
        // Uploading: not ready yet, and it says why.
        expect(screen.getByRole("button", { name: "Wait for the upload to finish" }).className).toContain("bg-press")
        await act(async () => uploaded[0]("u-photo"))
        await waitFor(() => expect(screen.getByRole("button", { name: "Reply" }).className).not.toContain("bg-press"))
        expect(screen.getByRole("button", { name: "Reply" }).className).toContain("bg-brand")
    })

    it("has @ and attach, and no other tools", async () => {
        compose()
        await editor()
        expect(screen.getByRole("button", { name: "Mention someone" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Attach files" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: /record|emoji|format|later/i })).toBeNull()
    })
})

// Where comments keep no files (a table's rows, for now), the composer offers
// none: no paperclip, no file input.
describe("a composer that takes no files", () => {
    it("offers no way to attach one", async () => {
        render(
            <TooltipProvider>
                <CommentComposer docId="table_row:r1" placeholder="Add a comment…" label="Comment on this row" uploads={false} onSend={sender()} />
            </TooltipProvider>,
        )
        await editor()
        expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull()
        expect(document.querySelector('[data-comment-composer] input[type="file"]')).toBeNull()
    })
})

describe("the foot bar of a phone's comment pages", () => {
    const published = () => document.documentElement.style.getPropertyValue("--mobile-drawer-h")
    let top = 768
    beforeEach(() => {
        top = 768
        Object.defineProperty(window, "innerHeight", { value: 844, configurable: true })
        // The bar sits at the screen's foot, 76px tall.
        vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
            return (this.hasAttribute("data-phone-foot") ? { top, bottom: 844, left: 0, right: 390, width: 390, height: 844 - top, x: 0, y: top } : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect
        })
    })
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        document.documentElement.style.removeProperty("--mobile-drawer-h")
    })

    it("publishes its top as the page's foot, and takes it back when it goes", () => {
        const { unmount } = render(<CommentFoot>Reply</CommentFoot>)
        expect(published()).toBe("76px")
        unmount()
        expect(published()).toBe("")
    })

    it("publishes it again when the screen turns", () => {
        render(<CommentFoot>Reply</CommentFoot>)
        top = 300
        Object.defineProperty(window, "innerHeight", { value: 390, configurable: true })
        act(() => void window.dispatchEvent(new Event("resize")))
        expect(published()).toBe("90px")
    })

    it("keeps the bar's look, and a caller's padding over it", () => {
        const { container } = render(<CommentFoot className="px-4 py-3">Note</CommentFoot>)
        const bar = container.querySelector("[data-phone-foot]")!
        expect(bar.className).toContain("border-t")
        expect(bar.className).toContain("px-4 py-3")
        expect(bar.className).not.toMatch(/\bpx-3\b|\bpt-2\b|pb-\[/)
    })
})
