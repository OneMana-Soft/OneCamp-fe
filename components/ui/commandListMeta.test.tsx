import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"

import { CommandList } from "@/components/ui/CommandList"

afterEach(cleanup)

// The @ list's agent rows say what asking them means (chat C41), as a second
// line under the name, which content's CommandList had dropped.
describe("a CommandList row with a meta line", () => {
  it("shows it under the label and grows to 44px", () => {
    const { container } = render(
      <CommandList
        label="Mention someone"
        items={[
          { id: "a", label: "Release Captain", meta: "Agent · acts for you" },
          { id: "b", label: "Maya Chen" },
        ]}
        onSelect={vi.fn()}
      />,
    )
    const rows = container.querySelectorAll("[role=option]")
    expect(rows[0].querySelector("[data-row-meta]")!.textContent).toBe("Agent · acts for you")
    expect(rows[0].className).toMatch(/\bh-11\b/)
    expect(rows[1].querySelector("[data-row-meta]")).toBeNull()
  })

  it("is given to AI agents in the @ list", () => {
    const src = readFileSync("components/minimal-tiptap/extensions/mention-list/mentionList.tsx", "utf8")
    expect(src).toMatch(/meta: person\.is_bot && isAIBot\(/)
  })
})
