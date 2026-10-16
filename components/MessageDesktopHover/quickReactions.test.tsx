import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// MC-77: the toolbar's quick reactions were always ✅ 👀 🙌. They are your
// three most recent, topped up from those.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { MessageDesktopHoverOptionsForMainChatAndChannel } = await import("./messageDesktopHoverOptionsForMainChatAndChannel")
const { noteReaction, readRecentReactions } = await import("@/lib/chat/recentReactions")

function toolbar(onReactionSelect: (id: string) => void) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <MessageDesktopHoverOptionsForMainChatAndChannel
          setIsDropdownOpen={() => {}}
          channelUUID="c1"
          postUUID="p1"
          messageText="<p>Load test is running now.</p>"
          editMessage={() => {}}
          deleteMessage={() => {}}
          isOwner
          onReactionSelect={onReactionSelect}
        />
      </TooltipProvider>
    </Provider>,
  )
}

/** The quick reactions, as their buttons are named. */
const quick = () => screen.getAllByRole("button", { name: /^React with / }).map((b) => b.getAttribute("aria-label"))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("the toolbar's quick reactions", () => {
  it("are ✅ 👀 🙌 for someone who hasn't reacted yet", () => {
    toolbar(() => {})
    expect(quick()).toEqual(["React with Mark as done", "React with Take a look", "React with Nice work"])
  })

  it("lead with the reactions you used last", () => {
    noteReaction({ id: "rocket", native: "🚀", name: "Rocket" })
    noteReaction({ id: "eyes", native: "👀", name: "Eyes" })
    const picked = vi.fn()
    toolbar(picked)
    expect(quick()).toEqual(["React with Take a look", "React with Rocket", "React with Mark as done"])

    fireEvent.click(screen.getByRole("button", { name: "React with Rocket" }))
    expect(picked).toHaveBeenCalledWith("rocket")
    expect(readRecentReactions()[0].id).toBe("rocket")
  })
})
