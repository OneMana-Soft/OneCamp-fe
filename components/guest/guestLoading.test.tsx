import { Suspense } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A guest page waiting for its first answer showed a centred spinner (in the
// accent, on three of them) and nothing of the page to come; the page then
// arrived all at once. It now holds the page's own shape and says in words
// what it is doing.
vi.mock("@/services/guestService", () => ({
  getGuestCollabSession: () => new Promise(() => {}),
  guestCollabToken: vi.fn(),
  getGuestTable: () => new Promise(() => {}),
}))
vi.mock("@/components/guest/GuestDocViewer", () => ({ GuestDocViewer: () => null }))
vi.mock("@/components/guest/GuestDocComments", () => ({ GuestDocComments: () => null }))
vi.mock("@/components/guest/GuestBoardViewer", () => ({ GuestBoardViewer: () => null }))
vi.mock("@/components/guest/GuestTableViewer", () => ({ GuestTableViewer: () => null }))

import { GuestNotYet } from "./guestUi"
import GuestDocPage from "@/app/guest/d/[token]/page"
import GuestBoardPage from "@/app/guest/b/[token]/page"
import GuestTablePage from "@/app/guest/t/[token]/page"

async function open(Page: (p: { params: Promise<{ token: string }> }) => React.ReactNode) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <Page params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}
const spinner = () => document.querySelector(".animate-spin")

describe("a guest page before its first answer", () => {
  afterEach(() => cleanup())

  it("holds the page's shape, not a spinner", () => {
    render(<GuestNotYet trouble={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Opening the link…")
    expect(spinner()).toBeNull()
  })

  it("keeps the shape while it says the server can't be reached", () => {
    render(<GuestNotYet trouble="unreachable" shape="table" />)
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
    expect(spinner()).toBeNull()
  })

  it.each([
    ["doc", GuestDocPage, "Opening the shared document…"],
    ["board", GuestBoardPage, "Opening the shared board…"],
    ["table", GuestTablePage, "Opening the shared table…"],
  ] as const)("a shared %s says what it is opening", async (_, Page, words) => {
    await open(Page)
    expect(screen.getByRole("status")).toHaveTextContent(words)
    expect(spinner()).toBeNull()
  })
})
