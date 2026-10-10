import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A message's actions toolbar is built each time a message is hovered or
// focused, so what it costs to build is paid on every hover. Its labels were
// Radix tooltips, each a provider, popper, anchor, portal and presence: 438
// components to build the toolbar in this test, four fifths of them tooltips.
// The labels are CSS tips now (actionTip.ts); the menu, picker and dialogs
// behind the other buttons are unchanged.

const counts = vi.hoisted(() => {
    const c = { fibers: 0 }
    const COMPONENT = new Set([0, 1, 11, 14, 15])
    // Counts the components each commit rendered, as React DevTools does.
    const walk = (next: any, prev: any) => {
        if (COMPONENT.has(next.tag) && (prev === null || (next.flags & 1) === 1)) c.fibers++
        if (prev !== null && next.child === prev.child) return
        let child = next.child
        while (child) {
            walk(child, prev === null ? null : child.alternate)
            child = child.sibling
        }
    }
    ;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        renderers: new Map(),
        supportsFiber: true,
        isDisabled: false,
        inject(r: unknown) {
            const id = this.renderers.size + 1
            this.renderers.set(id, r)
            return id
        },
        onScheduleFiberRoot() {},
        onCommitFiberRoot(_id: number, root: any) {
            try {
                walk(root.current, root.current.alternate)
            } catch {}
        },
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
        checkDCE() {},
    }
    return c
})

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
        counts.fibers = 0
        toolbar()
        expect(counts.fibers).toBeLessThan(220)
    })

    it("still labels each action, by name and by sight", () => {
        toolbar()
        for (const name of ["React with Mark as done", "Reply", "Reply in thread", "Forward", "More actions"]) {
            const button = screen.getByRole("button", { name })
            expect(button.getAttribute("data-tip"), name).toBeTruthy()
        }
        const more = screen.getByRole("button", { name: "More actions" })
        fireEvent.keyDown(more, { key: "Enter" })
        expect(screen.getByRole("menu")).toBeTruthy()
    })
})
