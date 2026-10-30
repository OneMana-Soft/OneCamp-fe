import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// The AI edition's add-ons (lib/addOns): Translate on a message
// (translateAddOn) and Ask AI on a file in the viewer (askAboutAddOn),
// offered only while AI is on. The surfaces get them through the AI edition's
// own lines in lib/addOns/messages.ts and attachments.ts, as the app does
// (the tests' setup otherwise draws surfaces with none).
vi.mock("@/lib/addOns/messages", () => vi.importActual("@/lib/addOns/messages"))
vi.mock("@/lib/addOns/attachments", () => vi.importActual("@/lib/addOns/attachments"))

let aiOn = true
vi.mock("@/hooks/useClientConfig", async (real) => ({ ...(await real<object>()), useAIAvailable: () => aiOn }))
const translateText = vi.fn(async () => ({ translation: "El lanzamiento pasa al jueves." }))
const analyzeImage = vi.fn(async () => ({ description: "A floor plan with three rooms." }))
const analyzeDocument = vi.fn(async () => ({ description: "The brief asks for a launch on Thursday." }))
vi.mock("@/services/aiService", () => ({
  useTranslateText: () => ({ translateText, isSubmitting: false }),
  useAnalyzeImage: () => ({ analyzeImage, isSubmitting: false }),
  useAnalyzeDocument: () => ({ analyzeDocument, isSubmitting: false }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
  useMediaFetch: () => ({ data: { url: "https://files.example/plan.png" } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({ default: ({ content }: { content?: string }) => <div>{content}</div> }))
// The More menu as the card fills it (MessageDesktopDropdown draws the same: moreMenuAddOns.test).
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: ({ addOns }: { addOns?: { key: string; label: string; run: () => void }[] }) => (
    <div role="menu">
      {addOns?.map((a) => <button key={a.key} role="menuitem" onClick={a.run}>{a.label}</button>)}
    </div>
  ),
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))
vi.mock("@/components/attachments/documentViewer", () => ({ default: () => <div /> }))
vi.mock("@/components/attachments/videoPlayer", () => ({ default: () => <div /> }))
vi.mock("@/components/fileUpload/AudioPlayer", () => ({ AudioPlayer: () => <div /> }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")
const { MessageActionSheet } = await import("@/components/drawers/messageActionSheet")
const { MediaLightboxDialog } = await import("@/components/dialog/attachmentLightboxDialog")

beforeEach(() => {
  aiOn = true
  vi.clearAllMocks()
})
afterEach(cleanup)

const TEXT = "<p>The launch moves to Thursday.</p>"
const TRANSLATION = "El lanzamiento pasa al jueves."

const card = () =>
  render(
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

const sheet = (text: string) =>
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
      messageText={text}
    />,
  )

const viewer = (media: Record<string, string>, source?: { srcKey: string; srcRef: string }) =>
  render(<MediaLightboxDialog media={media as never} allMedia={[media as never]} mediaGetUrl="/media/c1" dialogOpenState setOpenState={() => {}} source={source} />)

const PICTURE = { attachment_uuid: "a1", attachment_file_name: "plan.png", attachment_type: "image" }
const DOCUMENT = { attachment_uuid: "a2", attachment_file_name: "brief.pdf", attachment_type: "document" }
const SOURCE = { srcKey: "channel", srcRef: "c1" }

describe("Translate on a message", () => {
  it("on a computer, comes from More and shows under the message, with the way back to the original", async () => {
    const { container } = card()
    fireEvent.pointerEnter(container.querySelector("#msg-p1")!)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Translate" }))
    expect(await screen.findByText(TRANSLATION)).toBeTruthy()
    expect(translateText).toHaveBeenCalledWith(TEXT, expect.any(String))
    // Once it's there, the card is its one toggle: More offers it no more.
    expect(screen.queryByRole("menuitem", { name: "Translate" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show original" }))
    expect(screen.queryByText(TRANSLATION)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show translation" }))
    expect(screen.getByText(TRANSLATION)).toBeTruthy()
    expect(translateText).toHaveBeenCalledTimes(1)
  })

  it("on a phone, comes from the message's sheet and shows under its rows", async () => {
    sheet(TEXT)
    fireEvent.click(screen.getByRole("button", { name: "Translate" }))
    expect(await screen.findByText(TRANSLATION)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull()
    expect(screen.getByRole("button", { name: "Show original" })).toBeTruthy()
  })

  it("isn't offered for a message with no words, or while AI is off", () => {
    sheet("   ")
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull()
    cleanup()
    aiOn = false
    sheet(TEXT)
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull()
  })
})

describe("Ask AI on an attachment in the viewer", () => {
  it.each([
    ["a picture", PICTURE, "Ask AI about this image", analyzeImage, "A floor plan with three rooms."],
    ["a document", DOCUMENT, "Summarise with AI", analyzeDocument, "The brief asks for a launch on Thursday."],
  ] as const)("asks about %s where it was posted, and shows the answer", async (_, media, label, asked, answer) => {
    viewer(media, SOURCE)
    fireEvent.click(screen.getByRole("button", { name: label }))
    expect(await screen.findByText(answer)).toBeTruthy()
    expect(screen.getByText("AI summary")).toBeTruthy()
    expect(asked).toHaveBeenCalledWith(media.attachment_uuid, "channel", "c1")
  })

  it("isn't offered without where it was posted, for a file it can't read, or while AI is off", () => {
    viewer(PICTURE)
    expect(screen.queryByRole("button", { name: /ask ai|summarise/i })).toBeNull()
    cleanup()
    viewer({ attachment_uuid: "a3", attachment_file_name: "budget.xlsx", attachment_type: "document" }, SOURCE)
    expect(screen.queryByRole("button", { name: /ask ai|summarise/i })).toBeNull()
    cleanup()
    aiOn = false
    viewer(PICTURE, SOURCE)
    expect(screen.queryByRole("button", { name: /ask ai|summarise/i })).toBeNull()
  })
})
