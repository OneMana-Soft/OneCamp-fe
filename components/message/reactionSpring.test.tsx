import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// Adding your reaction answers with a little spring (the playful layer's
// springPop, 1 -> 1.12 -> 1); taking it back does not.

vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const pops = vi.fn()
vi.mock("@/lib/celebrate", () => ({ springPop: (el: Element) => pops(el), celebrate: () => 0 }))

const { ReactionPill } = await import("./reactionPill")

afterEach(() => {
  cleanup()
  pops.mockReset()
})

const pill = (isSelected: boolean, onClickEmoji = vi.fn()) =>
  render(
    <TooltipProvider>
      <ReactionPill emojiId="eyes" reactionUserNames={["Maya Chen"]} onClickEmoji={onClickEmoji} isSelected={isSelected} />
    </TooltipProvider>,
  )

describe("a reaction", () => {
  it("springs when you add yours", () => {
    const onClickEmoji = vi.fn()
    pill(false, onClickEmoji)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(pops).toHaveBeenCalledWith(button)
    expect(onClickEmoji).toHaveBeenCalledWith("eyes")
  })

  it("does not when you take yours back", () => {
    pill(true)
    fireEvent.click(screen.getByRole("button"))
    expect(pops).not.toHaveBeenCalled()
  })
})
