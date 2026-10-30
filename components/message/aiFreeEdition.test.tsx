import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// The AI-free edition offers nothing of AI's (E1, 22 Oct 2026). Its build
// shipped Translate on every message, on a computer and on a phone, and Ask
// AI and Summarise with AI on a picture or a document in the viewer; each
// asked the server for AI, which that edition doesn't have, and failed. Its
// build gives no add-ons (lib/addOns/messages.ts and attachments.ts have no
// line for the AI's), as here.

vi.mock("@/lib/addOns/messages", () => vi.importActual("@/lib/addOns/core"))
vi.mock("@/lib/addOns/attachments", () => vi.importActual("@/lib/addOns/core"))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
  useMediaFetch: () => ({ data: { url: "https://files.example/plan.png" } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/textInput/textInput", () => ({ default: ({ content }: { content?: string }) => <div>{content}</div> }))
// The More menu as the card asks for it: an item for each thing it offers.
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: ({ addOns }: { addOns?: { key: string; label: string }[] }) => (
    <div role="menu">
      {addOns?.map((a) => <button key={a.key} role="menuitem">{a.label}</button>)}
    </div>
  ),
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))
vi.mock("@/components/attachments/documentViewer", () => ({ default: () => <div /> }))
vi.mock("@/components/attachments/videoPlayer", () => ({ default: () => <div /> }))
vi.mock("@/components/fileUpload/AudioPlayer", () => ({ AudioPlayer: () => <div /> }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")
const { MessageActionSheet } = await import("@/components/drawers/messageActionSheet")
const { MediaLightboxDialog } = await import("@/components/dialog/attachmentLightboxDialog")

afterEach(cleanup)

const AI = /translat|ask ai|summari[sz]e|ai summary/i
const TEXT = "<p>The launch moves to Thursday.</p>"
const SOURCE = { srcKey: "channel", srcRef: "c1" }

describe("the AI-free edition", () => {
  it("offers no Translate in a message's More menu on a computer", async () => {
    const { container } = render(
      <Provider store={store}>
        <TooltipProvider>
          <BaseMessageCard
            message={{ uuid: "p1", bodyText: TEXT, from: { user_uuid: "maya", user_name: "Maya Chen" } as never, createdAt: "2026-10-10T09:01:00Z" }}
            mediaGetUrl=""
            rightPanelConfig={{}}
            hoverOptionsConfig={{}}
            addReaction={() => {}}
            removeReaction={() => {}}
            removePost={() => {}}
            updatePost={() => {}}
          />
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.pointerEnter(container.querySelector("#msg-p1")!)
    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(screen.queryAllByRole("menuitem").map((i) => i.textContent)).toEqual([])
    expect(document.body.textContent).not.toMatch(AI)
  })

  it("offers no Translate in a message's sheet on a phone", () => {
    render(
      <MessageActionSheet
        open
        onOpenChange={() => {}}
        threadPath="/app/channel/c1/p1"
        onAddEmoji={() => {}}
        handleEmojiClick={() => {}}
        copyText={() => {}}
        editMessage={() => {}}
        deleteMessage={() => {}}
        messageText={TEXT}
      />,
    )
    expect(screen.getByRole("button", { name: "Copy text" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: AI })).toBeNull()
  })

  it.each([
    ["a picture", { attachment_uuid: "a1", attachment_file_name: "plan.png", attachment_type: "image" }],
    ["a document", { attachment_uuid: "a2", attachment_file_name: "brief.pdf", attachment_type: "document" }],
  ])("offers no AI on %s in the viewer", (_, media) => {
    render(
      <MediaLightboxDialog
        media={media as never}
        allMedia={[media as never]}
        mediaGetUrl="/media/c1"
        dialogOpenState
        setOpenState={() => {}}
        source={SOURCE}
      />,
    )
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.queryByRole("button", { name: AI })).toBeNull()
  })
})
