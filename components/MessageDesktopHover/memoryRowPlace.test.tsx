import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"

// A message's More menu opens above its button, so a row that arrived after
// the menu showed grew it under the pointer: the rows above jumped, and a
// mouse on its way to a row landed on the one before (e2e/sideMenusMore.spec.ts,
// "Remind me… opened by keyboard"). Save to memory's row draws with More, the
// moment it opens; only the kinds beside it are a chunk, fetched as the
// pointer or the focus reaches the row, and More waits for none of it.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

let ai = true
vi.mock("@/hooks/useClientConfig", async (original) => ({ ...(await original<object>()), useFeature: () => ai, useAIAvailable: () => ai }))

const captured = vi.fn(async (input: unknown) => input)
vi.mock("@/services/memoryService", async (original) => ({ ...(await original<object>()), captureMemory: (input: unknown) => captured(input) }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { MessageDesktopHoverOptionsForMainChatAndChannel } = await import("./messageDesktopHoverOptionsForMainChatAndChannel")

function openMore(messageText: string) {
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MessageDesktopHoverOptionsForMainChatAndChannel
          setIsDropdownOpen={() => {}}
          channelUUID="c1"
          postUUID="p1"
          messageText={messageText}
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
  fireEvent.keyDown(screen.getByRole("button", { name: "More actions" }), { key: "Enter" })
}

const memoryRow = () => screen.queryByRole("menuitem", { name: "Save to memory" })

describe("a message's Save to memory row in its More menu", () => {
  afterEach(() => {
    cleanup()
    ai = true
    captured.mockClear()
  })

  it("is there, pressable, in the frame More opens in", () => {
    openMore("<p>Load test is running now.</p>")
    expect(screen.getByRole("menuitem", { name: "Copy text" })).toBeTruthy()
    expect(memoryRow()).toBeTruthy()
    expect(memoryRow()?.getAttribute("aria-disabled")).toBeNull()
  })

  it("offers its kinds once their code lands, moves no row of More, and a kind saves the message's words", async () => {
    openMore("<p>Load test is running <b>now</b>.</p>")
    const rows = screen.getAllByRole("menuitem").length
    fireEvent.keyDown(memoryRow()!, { key: "ArrowRight" })
    const decision = await screen.findByRole("menuitem", { name: /Decision/ })
    expect(screen.getAllByRole("menuitem").length - rows).toBe(3)
    fireEvent.click(decision)
    await waitFor(() => expect(captured).toHaveBeenCalledWith({ kind: "decision", content: "Load test is running now.", source_type: "post", source_uuid: "p1", channel_uuid: "c1" }))
  })

  it("isn't there for a message without words, which memory can't take", () => {
    openMore("<p> </p>")
    expect(screen.getByRole("menuitem", { name: "Copy text" })).toBeTruthy()
    expect(memoryRow()).toBeNull()
  })

  it("isn't there where AI is off", () => {
    ai = false
    openMore("<p>Load test is running now.</p>")
    expect(screen.getByRole("menuitem", { name: "Copy text" })).toBeTruthy()
    expect(memoryRow()).toBeNull()
  })
})
