import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DocCommentMessageLongPressDrawer } from "./docCommentMessageLongPressDrawer"
import { setPhoneModerator } from "@/components/docComments/phoneModeration"

// The sheet reads the doc from the address, as on the doc's thread page.
let params: Record<string, string> = { "doc-id": "doc-1" }
vi.mock("next/navigation", () => ({ useParams: () => params }))
let release: () => void = () => {}

// A doc comment's long-press sheet on a phone (B7, N45): Edit showed for
// everyone, and failed for all but the comment's author; a doc's owner could
// not take an abusive comment down.

afterEach(() => {
    cleanup()
    release()
    params = { "doc-id": "doc-1" }
    document.querySelectorAll("[data-vaul-drawer-wrapper]").forEach((n) => n.remove())
    document.body.removeAttribute("style")
})

function sheet(isOwner: boolean, deleteMessage = vi.fn()) {
    render(
        <DocCommentMessageLongPressDrawer
            drawerOpenState
            setOpenState={() => {}}
            onAddEmoji={() => {}}
            editMessage={() => {}}
            deleteMessage={deleteMessage}
            copyTextToClipboard={() => {}}
            handleEmojiClick={() => {}}
            isOwner={isOwner}
        />,
    )
    return deleteMessage
}

describe("a doc comment's long-press sheet", () => {
    it("offers edit and delete to the comment's author", () => {
        sheet(true)
        expect(screen.getByText("Edit comment")).toBeTruthy()
        expect(screen.getByText("Delete comment")).toBeTruthy()
    })

    it("offers someone else's comment only reactions and a copy", () => {
        sheet(false)
        expect(screen.getByText("Copy text")).toBeTruthy()
        expect(screen.queryByText("Edit comment")).toBeNull()
        expect(screen.queryByText("Delete comment")).toBeNull()
    })

    it("lets whoever moderates the doc delete anyone's comment, but not edit it", async () => {
        release = setPhoneModerator("doc-1", true)
        const remove = sheet(false)
        expect(screen.queryByText("Edit comment")).toBeNull()
        fireEvent.click(screen.getByText("Delete comment"))
        await new Promise((r) => setTimeout(r, 150))
        expect(remove).toHaveBeenCalledTimes(1)
    })

    // A moderator of one doc was offered Delete on another's comments, which the server refused.
    it("doesn't carry a doc's moderation to another doc, or past its page", () => {
        release = setPhoneModerator("doc-1", true)
        params = { "doc-id": "doc-2" }
        sheet(false)
        expect(screen.queryByText("Delete comment")).toBeNull()
        cleanup()
        params = { "doc-id": "doc-1" }
        release()
        sheet(false)
        expect(screen.queryByText("Delete comment")).toBeNull()
    })
})
