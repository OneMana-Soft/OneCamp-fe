import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// The row under the message box: formatting on the left, the actions on the
// right, Send last.
//  - On a phone the opened formatting row pushed Send off the box (the toolbar
//    would not shrink), and Enter is a new line there, so a message could not
//    be sent until the formatting was closed again.
//  - The formatting group sat 2px below the actions' centre line.
//  - Under a finger every button is 40px; under a mouse they stay 32px.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
vi.mock("@/components/clips/ClipButton", () => ({ ClipButton: () => null }))

import MinimalTiptapTextInput, { COMPOSER_ROW_TOUCH } from "./textInput"
import { SchedulePicker } from "@/components/messages/scheduleSendButton"

afterEach(cleanup)

const composer = () =>
  render(
    <TooltipProvider>
      <MinimalTiptapTextInput
        throttleDelay={20}
        output="html"
        content=""
        editable
        ButtonIcon={SendHorizontal}
        buttonOnclick={() => {}}
        onSchedule={() => {}}
        attachmentOnclick={() => {}}
      />
    </TooltipProvider>,
  )

describe("the composer's button row", () => {
  it("lets the formatting scroll and keeps the actions, Send included, on the box", async () => {
    composer()
    const send = await waitFor(() => screen.getByRole("button", { name: "Send" }))
    const actions = send.closest("div.flex") as HTMLElement
    expect(actions.className).toContain("shrink-0")
    const formatting = screen.getByRole("button", { name: "Show formatting" }).closest(".overflow-x-auto") as HTMLElement
    expect(formatting.className).toContain("min-w-0")
    expect(formatting.className).toContain("flex-1")
    expect(formatting.className).not.toContain("shrink-0")
    // Even padding top and bottom, so both groups share one centre line.
    expect(formatting.className).toContain("py-1")
    expect(formatting.className).not.toMatch(/\bpb-0\b/)
  })

  it("makes every button in both groups 40px under a finger", async () => {
    composer()
    const send = await waitFor(() => screen.getByRole("button", { name: "Send" }))
    expect(COMPOSER_ROW_TOUCH).toBe("pointer-coarse:[&_button]:size-10")
    expect((send.closest("div.flex") as HTMLElement).className).toContain(COMPOSER_ROW_TOUCH)
    expect((screen.getByRole("button", { name: "Show formatting" }).closest(".overflow-x-auto") as HTMLElement).className).toContain(COMPOSER_ROW_TOUCH)
  })

  it("draws its triggers as the row's other buttons: square corners and 16px icons", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8")
    expect(read("components/clips/ClipButton.tsx")).not.toContain("rounded-full")
    expect(read("components/messages/scheduleSendButton.tsx")).not.toContain("rounded-full")
    expect(read("components/minimal-tiptap/components/emoji-reaction/reaction-picker.tsx")).toMatch(/<Smile className="size-4"/)
    // Every formatting section and the emoji button are told the row's size:
    // without it a toggle falls back to min-w-9, 36px beside 32px ones.
    const row = read("components/textInput/textInput.tsx")
    for (const part of ["SectionTwo", "SectionFour", "SectionFive", "EmojiReactionPicker"]) {
      expect(row).toMatch(new RegExp(`<${part}[^>]*size="sm"`, "s"))
    }
  })
})

describe("send later's custom time", () => {
  it("puts the action under the field, inside the popover's width", () => {
    const { container } = render(<SchedulePicker onPick={() => {}} />)
    const row = container.querySelector("[data-schedule-custom]") as HTMLElement
    expect(row.className).toContain("flex-col")
    expect(screen.getByRole("button", { name: "Schedule" }).className).toContain("self-end")
  })
})
