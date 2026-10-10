import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// What sits under a message: work cards, agent results, files and the faces of
// a thread's repliers.
//  - Three widths stacked under one message (448px task and doc cards, a
//    1,113px pull request card, 370px files): one width now.
//  - The work cards' tiles were grey; they take the thing's own hue.
//  - A file was a clickable box nobody could Tab to, named by a cut at a fixed
//    count of letters ("OneCamp brand....pdf"): a button now, cut by width.
//  - The repliers' faces overlapped as grey squares with two initials each and
//    read as one word ("MCJW").

vi.mock("@/hooks/useFetch", () => ({
  useMediaFetch: () => ({ data: { url: "https://files.example/x" } }),
  useFetch: (url: string) => ({
    data: url.includes("doc") ? { data: { doc_title: "Launch sync notes", doc_snippet: "Doc" } } : undefined,
  }),
}))
vi.mock("@/lib/utils/file/downloadFile", () => ({ downloadFile: vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

const { linkCardClass } = await import("./LinkCard")
const { MessageAttachments } = await import("./MessageAttachments")
const { WorkLinkCards } = await import("./WorkLinkCards")
const { ThreadParticipants } = await import("./threadParticipants")
const { BottomMenu } = await import("./bottomMenu")
const { Provider } = await import("react-redux")
const { default: store } = await import("@/store/store")

afterEach(cleanup)

const LONG = "OneCamp brand guidelines, October 2026, final version for the agency.pdf"

describe("cards under a message", () => {
  it("share one width, the full width on a phone", () => {
    expect(linkCardClass).toContain("w-full")
    expect(linkCardClass).toContain("max-w-md")
  })

  it("draw a file as a named button with its whole name, cut by width", () => {
    const { container } = render(
      <MessageAttachments
        attachments={[{ attachment_uuid: "a1", attachment_file_name: LONG, attachment_type: "document", attachment_size: 4820000, attachment_created_at: "", attachment_raw_type: "application/pdf" }]}
        mediaGetUrl="/ch/getFile/c1"
        attachmentSelected={() => {}}
      />,
    )
    const button = screen.getByRole("button", { name: `Download ${LONG}` })
    expect(button.getAttribute("data-file-card")).toBe("")
    expect(button.textContent).toContain(LONG)
    expect(button.querySelector(".truncate")).toBeTruthy()
    const box = container.querySelector("[data-message-attachments]")!
    expect(box.className).toContain("max-w-md")
    expect(box.className).not.toContain("md:w-1/3")
    expect(box.className).not.toMatch(/\bmb-4\b/)
  })

  it("tint a doc card's tile in the doc's own hue", () => {
    const id = "f75cbe7f-9ee2-4513-b2dc-46aba48a34aa"
    const { container } = render(<WorkLinkCards text={`see /app/doc/${id}`} />)
    const tile = container.querySelector("a > span:first-child")!
    expect(tile.className).toMatch(/\bhue-(sky|moss|sun|dusk|berry|lake)\b/)
    expect(tile.className).toContain("bg-hue-tint")
    expect(tile.className).not.toContain("bg-muted")
  })
})

describe("the reactions under a message", () => {
  it("keep the same 6px from what is above as the cards", () => {
    const { container } = render(
      <Provider store={store}>
        <TooltipProvider>
          <BottomMenu reactions={{ fire: ["Jonas Weber"] }} handleEmojiClick={() => {}} />
        </TooltipProvider>
      </Provider>,
    )
    expect(container.querySelector("[data-reactions]")!.className).toContain("mt-1.5")
  })
})

describe("the faces of a thread's repliers", () => {
  it("are round, coloured, one initial each, with a ring between them", () => {
    const { container } = render(
      <TooltipProvider>
        <ThreadParticipants
          participants={[
            { uuid: "maya", name: "Maya Chen" },
            { uuid: "jonas", name: "Jonas Weber" },
          ]}
        />
      </TooltipProvider>,
    )
    const faces = [...container.querySelectorAll("[data-participant]")]
    expect(faces).toHaveLength(2)
    expect(faces.map((f) => f.textContent)).toEqual(["M", "J"])
    for (const f of faces) {
      expect(f.className).toContain("rounded-full")
      expect(f.className).toContain("ring-background")
      expect(f.querySelector("[class*='bg-hue-tint']")).toBeTruthy()
    }
  })
})
