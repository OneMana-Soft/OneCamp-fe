import * as React from "react"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

// What the recent read answers: an envelope, undefined while it comes or after it failed (useFetch keeps no data then).
let answer: unknown
const asked: string[] = []

vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink({ href, prefetch: _p, scroll: _s, children, ...rest }: Record<string, any>, ref: React.Ref<HTMLAnchorElement>) {
    return (
      <a ref={ref} href={String(href)} {...rest}>
        {children}
      </a>
    )
  }),
}))
vi.mock("react-redux", async (orig) => ({
  ...(await orig<typeof import("react-redux")>()),
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { usersStatus: {} }, split: {} }),
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    asked.push(key)
    return { data: answer }
  },
}))

import { RecentPlacesSection } from "@/components/navigationBar/desktop/RecentPlacesSection"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"

const recent = (uuid: string, title: string) => ({ kind: "recent", resource_kind: "board", resource_uuid: uuid, position: "", title, href: `/app/board/${uuid}` })

const draw = (path = ["", "app", "home"]) =>
  render(
    <MediaQueryProvider>
      <TooltipProvider>
        <RecentPlacesSection kind="board" title="Recent boards" href="/app/board" path={path} />
      </TooltipProvider>
    </MediaQueryProvider>,
  )

beforeEach(() => {
  answer = undefined
  asked.length = 0
})
afterEach(cleanup)

// Recent boards in the sidebar (miro-46): the boards the person opened
// lately, newest first, each opening its board; nothing to show is no section.
describe("the sidebar's Recent boards", () => {
  it("lists the boards opened lately, newest first, each a link to its board, the heading to all boards", () => {
    answer = { msg: "ok", data: { places: [recent("b2", "Retro"), recent("b1", "Q4 launch")] } }
    draw()
    expect(asked[0]).toBe("/places/recent?resource_kind=board&limit=5")
    const section = screen.getByRole("region", { name: "Recent boards" })
    const links = within(section).getAllByRole("link")
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Recent boards", "/app/board"],
      ["Retro", "/app/board/b2"],
      ["Q4 launch", "/app/board/b1"],
    ])
  })

  it("marks the board open now as the current row", () => {
    answer = { msg: "ok", data: { places: [recent("b2", "Retro"), recent("b1", "Q4 launch")] } }
    draw(["", "app", "board", "b1"])
    expect(screen.getByRole("link", { name: "Q4 launch" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "Retro" }).getAttribute("aria-current")).toBeNull()
  })

  it("draws no section when nothing was opened, nor while the read comes, fails or the app is offline", () => {
    answer = { msg: "ok", data: { places: [] } }
    draw()
    expect(screen.queryByRole("region", { name: "Recent boards" })).toBeNull()
    cleanup()
    answer = undefined
    draw()
    expect(screen.queryByRole("region", { name: "Recent boards" })).toBeNull()
    expect(screen.queryByText("Recent boards")).toBeNull()
  })
})
