import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }) }))

const { SystemLineRow } = await import("@/components/message/systemLineRow")

afterEach(cleanup)

// A line the server wrote about the conversation (chat A9) is drawn as a
// line: its words, and where it leads, with nothing to reply to or react to.
describe("a system line's row", () => {
  it("shows the server's words and leads to the group the conversation continues in", () => {
    render(
      <SystemLineRow
        html="<p>Maya added Priya. The conversation continues with them in a new one.</p>"
        facts={JSON.stringify({ kind: "group.continued", actor: "maya", targets: ["priya"], to: "grp-new" })}
      />,
    )
    expect(screen.getByText(/Maya added Priya\. The conversation continues/)).toBeTruthy()
    const link = screen.getByRole("link", { name: "Open the new conversation" })
    expect(link.getAttribute("href")).toBe("/app/chat/group/grp-new")
    expect(link.hasAttribute("data-touch-target")).toBe(true)
    expect(document.querySelector("[data-system-line] button")).toBeNull()
  })

  it("leads nowhere when its facts don't say where, and still shows its words", () => {
    render(<SystemLineRow html="<p>Maya named the conversation “Launch crew”.</p>" facts="not json" />)
    expect(screen.getByText("Maya named the conversation “Launch crew”.")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
