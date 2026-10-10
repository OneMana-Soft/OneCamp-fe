import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A reply's parent was a second message inside the reply (a 36px avatar, the
// name, the time on its own line, up to 192px of text). It is one line now.
// A forwarded message's "view message" did nothing when pressed; it is a link.

vi.mock("@/hooks/useRelayedAuthor", () => ({ useRelayedAuthor: () => null }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-body="">{content}</div>,
}))

const { MessagePreview } = await import("./MessagePreview")

afterEach(cleanup)

const maya = { user_uuid: "maya", user_name: "Maya Chen", user_full_name: "Maya Chen" } as never

describe("a reply's parent", () => {
  it("is one line: the name and the start of what they said, no avatar or time", () => {
    const { container } = render(
      <MessagePreview vewFooter={false} msgBy={maya} msgText="<p>Final hero for the launch page is in.</p><p>Second paragraph</p>" msgCreatedAt="2026-10-10T09:00:00Z" />,
    )
    const line = container.querySelector("[data-quote-line]")!
    expect(line.textContent).toBe("Maya ChenFinal hero for the launch page is in. Second paragraph")
    expect(container.querySelector("[data-body]")).toBeNull()
    expect(container.querySelector(".h-9")).toBeNull()
    expect(line.querySelector(".truncate")).toBeTruthy()
  })
})

describe("a forwarded message", () => {
  it("links to the post it came from", () => {
    render(<MessagePreview vewFooter msgBy={maya} msgText="<p>Ship it</p>" msgChannelName="engineering" msgChannelUUID="ch1" msgUUID="p1" />)
    const link = screen.getByRole("link", { name: "View message" })
    expect(link.getAttribute("href")).toBe("/app/channel/ch1/p1")
    expect(screen.getByText(/Posted in #engineering/)).toBeTruthy()
  })

  it("says where a forwarded direct message came from, with nothing that does nothing", () => {
    render(<MessagePreview vewFooter msgBy={maya} msgText="<p>Ship it</p>" msgUUID="c1" />)
    expect(screen.getByText("From a direct message")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByText(/view conversation/i)).toBeNull()
  })

  it("draws its header on one line, with a 24px avatar", () => {
    const { container } = render(<MessagePreview vewFooter msgBy={maya} msgText="<p>Ship it</p>" msgCreatedAt="2026-10-10T09:00:00Z" />)
    const header = container.querySelector("[data-forwarded] > div")!
    expect(header.className).toContain("items-center")
    expect(header.querySelector(".h-6.w-6")).toBeTruthy()
  })
})
