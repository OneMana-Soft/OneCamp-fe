import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

// A message's link cards whose code can't load (offline, where lib/
// chunkRecovery doesn't reload the page): the links stay plain links, and the
// message and the rest of the conversation carry on. Their raw React.lazy threw
// to the page's error boundary, so one link took the whole conversation down.
vi.mock("@/components/message/workLinkCardsBody", () => {
  throw new Error("Loading chunk workLinkCardsBody failed")
})

const { WorkLinkCards } = await import("@/components/message/WorkLinkCards")

describe("link cards whose code can't load", () => {
  it("leave the message and the conversation drawn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(
      <ol>
        <li>
          <p>See the launch plan</p>
          <WorkLinkCards text="/app/task/0b0e7f1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b" />
        </li>
        <li>
          <p>Next message</p>
        </li>
      </ol>,
    )
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.getByText("See the launch plan")).toBeTruthy()
    expect(screen.getByText("Next message")).toBeTruthy()
    // No card, and no skeleton held for one that won't come.
    expect(document.querySelectorAll("[data-work-cards] > *")).toHaveLength(0)
    warn.mockRestore()
  })
})
