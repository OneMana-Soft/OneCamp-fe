import { renders } from "@/lib/testing/reactRenders"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A message's actions toolbar is built each time a message is hovered or
// focused, so what it costs to build is paid on every hover. Its labels were
// Radix tooltips, each a provider, popper, anchor, portal and presence: 438
// components to build the toolbar in this test, four fifths of them tooltips.
// The labels are CSS tips now (actionTip.ts); the menu, picker and dialogs
// behind the other buttons are unchanged.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { MessageDesktopHoverOptionsForMainChatAndChannel } = await import("./messageDesktopHoverOptionsForMainChatAndChannel")

function toolbar() {
    return render(
        <Provider store={store}>
            <TooltipProvider>
                <MessageDesktopHoverOptionsForMainChatAndChannel
                    setIsDropdownOpen={() => {}}
                    channelUUID="c1"
                    postUUID="p1"
                    messageText="<p>Load test is running now.</p>"
                    authorName="Maya Chen"
                    onReply={() => {}}
                    editMessage={() => {}}
                    deleteMessage={() => {}}
                    isOwner
                    isAdmin
                    onReactionSelect={() => {}}
                />
            </TooltipProvider>
        </Provider>,
    )
}

describe("a message's actions toolbar", () => {
    afterEach(cleanup)

    it("is cheap to build, since every hover builds it", () => {
        renders.reset()
        toolbar()
        expect(renders.count, renders.top()).toBeLessThan(220)
    })

    it("still labels each action, by name and by sight", () => {
        toolbar()
        for (const name of ["React with Mark as done", "Reply in thread", "More actions"]) {
            const button = screen.getByRole("button", { name })
            expect(button.getAttribute("data-tip"), name).toBeTruthy()
        }
        const more = screen.getByRole("button", { name: "More actions" })
        fireEvent.keyDown(more, { key: "Enter" })
        expect(screen.getByRole("menu")).toBeTruthy()
    })

    // Design v3 chat, C19: six slots (three quick reactions, add a reaction,
    // reply in thread, save for later, more), on the floating material.
    // Reply with quote, forward, translate, memory, make a task and the rest
    // live in More (C20).
    it("holds six slots on the pop surface, at most seven buttons, each named", () => {
        toolbar()
        const bar = screen.getByRole("toolbar", { name: "Message actions" })
        expect(bar.className).toContain("pop-surface")
        expect(bar.className).toContain("rounded-[10px]")
        const buttons = bar.querySelectorAll("button")
        expect(buttons.length).toBeLessThanOrEqual(7)
        for (const b of buttons) expect(b.getAttribute("aria-label"), b.outerHTML.slice(0, 80)).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Forward" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Reply" })).toBeNull()
    })

    it("puts reply with quote, forward and copy link in More, and asks before deleting there", () => {
        toolbar()
        fireEvent.keyDown(screen.getByRole("button", { name: "More actions" }), { key: "Enter" })
        for (const name of ["Reply with quote", "Forward", "Copy link", "Make a task", "Edit message"]) {
            expect(screen.getByRole("menuitem", { name }), name).toBeTruthy()
        }
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }))
        // Asked in place, inside the menu: no dialog for one message.
        expect(screen.getByRole("group", { name: "Delete this message?" })).toBeTruthy()
        expect(screen.queryByRole("alertdialog")).toBeNull()
    })
})
