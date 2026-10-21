import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RowBoundary } from "./rowBoundary"

// Design v3 chat, C34 and finding 1.5.2: one message that can't be drawn is a
// quiet row of its own; the rest of the conversation stays.
function Boom(): never {
  throw new Error("bad reaction")
}

describe("a row that can't be drawn", () => {
  it("becomes one quiet row, and the rows around it stay", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <div>
        <RowBoundary><p>Before</p></RowBoundary>
        <RowBoundary raw="<p>The words it held</p>"><Boom /></RowBoundary>
        <RowBoundary><p>After</p></RowBoundary>
      </div>,
    )
    expect(screen.getByText("Before")).toBeTruthy()
    expect(screen.getByText("After")).toBeTruthy()
    expect(screen.getByText("This message couldn't be shown")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show raw" }))
    expect(screen.getByText("The words it held")).toBeTruthy()
  })

  it("wraps every row of every conversation, in the list itself", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("components/message/MessageListVirtua.tsx", "utf8")
    expect(src).toMatch(/<RowBoundary raw=\{raw\}>\{renderItem\(/)
  })
})
