import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// Send reads as ready when there is something to send: words, or files that
// are attached and uploaded. A message of only a photo sent, but its Send
// button sat grey, as if there were nothing to send.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
vi.mock("@/components/clips/ClipButton", () => ({ ClipButton: () => null }))
vi.mock("@/components/messages/scheduleSendButton", () => ({ ScheduleSendButton: () => null }))

import MinimalTiptapTextInput from "./textInput"

afterEach(cleanup)

const composer = (content: string, hasAttachments?: boolean) =>
  render(
    <TooltipProvider>
      <MinimalTiptapTextInput
        throttleDelay={20}
        output="html"
        content={content}
        editable
        ButtonIcon={SendHorizontal}
        buttonOnclick={() => {}}
        attachmentOnclick={() => {}}
        hasAttachments={hasAttachments}
      />
    </TooltipProvider>,
  )

const MUTED = "bg-muted"
const send = () => screen.getByRole("button", { name: "Send" })

describe("the Send button", () => {
  it("reads as nothing to send with no words and no files", async () => {
    composer("")
    await waitFor(() => expect(send().className).toContain(MUTED))
  })

  it("reads as ready with a file attached and no words", async () => {
    composer("", true)
    await waitFor(() => expect(send()).toBeTruthy())
    expect(send().className).not.toContain(MUTED)
  })

  it("reads as ready with words", async () => {
    composer("<p>Ship it</p>")
    await waitFor(() => expect(send().className).not.toContain(MUTED))
    // Ready is the accent (the chosen theme): the one action on the composer.
    expect(send().className).toContain("bg-primary")
  })
})

// Every composer that takes files says whether it has some, so its Send can
// read as ready with only a file. One that didn't kept the grey button.
describe("every composer with a Send button and a paperclip", () => {
  const ROOT = join(__dirname, "..")
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".tsx") && !e.name.includes(".test.") ? [join(dir, e.name)] : [],
    )
  const composers = files(ROOT).filter((f) => {
    const src = readFileSync(f, "utf8")
    return /ButtonIcon=\{SendHorizontal\}/.test(src) && /attachmentOnclick/.test(src)
  })

  it("were found", () => {
    expect(composers.length).toBeGreaterThanOrEqual(15)
  })

  it.each(composers.map((f) => [f.slice(ROOT.length + 1)]))("%s passes hasAttachments", (f) => {
    expect(readFileSync(join(ROOT, f), "utf8")).toMatch(/hasAttachments=\{/)
  })
})
