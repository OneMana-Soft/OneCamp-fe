import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
// The emoji data loads late and set state after the test had ended.
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
let onPhone = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: onPhone, isDesktop: !onPhone }) }))
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
  // Design v3 chat, C26: one material for every card: raised at e1, r12,
  // 12/14 of padding, a 12px gap, at most 520px, lifting onto e2 on the
  // compositor (hover-lift), never by animating a shadow or a border.
  it("share one material and one width, the full width on a phone", () => {
    for (const c of ["w-full", "max-w-[520px]", "bg-raised", "shadow-e1", "rounded-xl", "px-3.5", "py-3", "gap-3", "hover-lift"]) expect(linkCardClass).toContain(c)
    expect(linkCardClass).not.toMatch(/\bborder\b|transition-colors|max-w-md/)
  })

  it("draw a file as a named button with its whole name, cut by width", () => {
    const { container } = render(
      <MessageAttachments
        attachments={[{ attachment_uuid: "a1", attachment_file_name: LONG, attachment_type: "document", attachment_size: 4820000, attachment_created_at: "", attachment_raw_type: "application/pdf" }]}
        mediaGetUrl="/ch/getFile/c1"
        attachmentSelected={() => {}}
      />,
    )
    const button = screen.getByRole("button", { name: `Open ${LONG}` })
    const card = container.querySelector("[data-file-card]")!
    expect(card.contains(button)).toBe(true)
    expect(button.querySelector("[data-file-name] .truncate")).toBeTruthy()
    expect(button.querySelector("[data-file-name] .shrink-0")!.textContent).toBe("ency.pdf")
    // C24: the tile is in the kind's hue (a PDF is berry), and the name is cut in its middle.
    expect(card.getAttribute("data-file-kind")).toBe("pdf")
    expect(button.querySelector("[data-card-tile]")!.className).toContain("hue-berry")
    expect(button.textContent).toContain(LONG)
    const box = container.querySelector("[data-message-attachments]")!
    expect(box.className).toContain("max-w-[520px]")
    expect(box.className).not.toContain("md:w-1/3")
    expect(box.className).not.toMatch(/\bmb-4\b/)
  })

  // MC-50: every shared PDF was a download. A file the viewer can show opens
  // there, as a picture does, and keeps a Download of its own.
  it("open a PDF, a Word or an Excel file in the viewer, with Download beside", async () => {
    const { downloadFile } = await import("@/lib/utils/file/downloadFile")
    for (const [name, raw] of [["brief.pdf", "application/pdf"], ["plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ["notes.txt", "text/plain"]]) {
      vi.mocked(downloadFile).mockClear()
      const opened = vi.fn()
      const file = { attachment_uuid: name, attachment_file_name: name, attachment_type: "document" as const, attachment_size: 1000, attachment_created_at: "", attachment_raw_type: raw }
      render(<MessageAttachments attachments={[file]} mediaGetUrl="/ch/getFile/c1" attachmentSelected={opened} />)
      fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))
      expect(opened).toHaveBeenCalledWith(file)
      expect(downloadFile).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: `Download ${name}` }))
      expect(downloadFile).toHaveBeenCalledWith("https://files.example/x", name)
      expect(opened).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })

  it("download a PDF on a phone, whose browser can't show one in the page", async () => {
    onPhone = true
    try {
      render(
        <MessageAttachments
          attachments={[{ attachment_uuid: "p", attachment_file_name: "brief.pdf", attachment_type: "document", attachment_size: 1000, attachment_created_at: "", attachment_raw_type: "application/pdf" }]}
          mediaGetUrl="/ch/getFile/c1"
          attachmentSelected={() => {}}
        />,
      )
      expect(screen.queryByRole("button", { name: "Open brief.pdf" })).toBeNull()
      expect(screen.getByRole("button", { name: "Download brief.pdf" }).getAttribute("data-file-card")).toBe("")
    } finally {
      onPhone = false
    }
  })

  it("download a file the viewer can't show, in one button", async () => {
    const { downloadFile } = await import("@/lib/utils/file/downloadFile")
    vi.mocked(downloadFile).mockClear()
    const opened = vi.fn()
    render(
      <MessageAttachments
        attachments={[{ attachment_uuid: "z", attachment_file_name: "assets.zip", attachment_type: "other", attachment_size: 1000, attachment_created_at: "", attachment_raw_type: "application/zip" }]}
        mediaGetUrl="/ch/getFile/c1"
        attachmentSelected={opened}
      />,
    )
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull()
    const card = screen.getByRole("button", { name: "Download assets.zip" })
    expect(card.getAttribute("data-file-card")).toBe("")
    fireEvent.click(card)
    expect(downloadFile).toHaveBeenCalledWith("https://files.example/x", "assets.zip")
    expect(opened).not.toHaveBeenCalled()
  })

  it("tint a doc card's tile in the doc's own hue", () => {
    const id = "f75cbe7f-9ee2-4513-b2dc-46aba48a34aa"
    const { container } = render(<WorkLinkCards text={`see /app/doc/${id}`} />)
    const tile = container.querySelector("[data-card-tile]")!
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
          <BottomMenu reactions={{ fire: ["Jonas Weber"] }} handleEmojiClick={() => {}} selectedEmojiId="" />
        </TooltipProvider>
      </Provider>,
    )
    expect(container.querySelector("[data-reactions]")!.className).toContain("mt-2")
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
      expect(f.className).toContain("ring-sheet")
      expect(f.querySelector("[class*='avatar-person']")).toBeTruthy()
    }
  })
})
