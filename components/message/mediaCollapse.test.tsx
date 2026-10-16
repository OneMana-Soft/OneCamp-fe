import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// MC-BUG-9: /collapse said "Inline media collapsed" and hid nothing. The rule
// in app/globals.css hides [data-message-media], which no component set. The
// pictures under a message and the link cards carry it now, and this reads the
// rule from the stylesheet, so the two can't drift apart again.

vi.mock("@/hooks/useFetch", () => ({
  useMediaFetch: () => ({ data: { url: "https://files.example/x" } }),
  useFetch: () => ({ data: undefined }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/message/MessageAttachmentCard", () => ({ MessageAttachmentCard: () => <span data-picture="" /> }))

const { MessageAttachments } = await import("./MessageAttachments")
const { WorkLinkCards } = await import("./WorkLinkCards")

/** The selector of the stylesheet's rule that hides media while collapsed. */
function collapsedSelector(): string {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
  const rule = /(html\[data-media-collapsed="true"\][^{]*)\{\s*display:\s*none/.exec(css)
  expect(rule, "app/globals.css lost the /collapse rule").toBeTruthy()
  return rule![1].trim()
}

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute("data-media-collapsed")
})

describe("/collapse", () => {
  it("hides the pictures and the link cards under a message, and /expand shows them", () => {
    const selector = collapsedSelector()
    const { container } = render(
      <>
        <MessageAttachments
          attachments={[
            { attachment_uuid: "i1", attachment_file_name: "launch.png", attachment_type: "image", attachment_size: 1, attachment_created_at: "", attachment_raw_type: "image/png" },
            { attachment_uuid: "f1", attachment_file_name: "assets.zip", attachment_type: "other", attachment_size: 1, attachment_created_at: "", attachment_raw_type: "application/zip" },
          ]}
          mediaGetUrl="/ch/getFile/c1"
          attachmentSelected={() => {}}
        />
        <WorkLinkCards text={`see /app/doc/f75cbe7f-9ee2-4513-b2dc-46aba48a34aa`} />
      </>,
    )
    const grid = container.querySelector("[data-media-grid]")!
    const cards = container.querySelector("[data-work-cards]")!
    const files = container.querySelector("[data-file-grid]")!

    document.documentElement.setAttribute("data-media-collapsed", "true")
    expect(grid.matches(selector)).toBe(true)
    expect(cards.matches(selector)).toBe(true)
    // A file isn't inline media: Slack's /collapse leaves files too.
    expect(files.matches(selector)).toBe(false)

    document.documentElement.setAttribute("data-media-collapsed", "false")
    expect(grid.matches(selector)).toBe(false)
    expect(cards.matches(selector)).toBe(false)
  })
})
