import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"

// The three conversation headers (channel, DM, group) are one object at three
// arities (design v3 chat, C01, C02, C04 to C06): 52px on the sheet with a
// hairline below, the title at 15/590, then at most three trailing controls
// beside who is here. Source-level rather than a render test: the views need
// Redux, SWR, MQTT and a router to mount, and what matters is the shell.
const dm = readFileSync("components/chat/chatIdDesktop.tsx", "utf8")
const group = readFileSync("components/groupChat/chatGrpIdDesktop.tsx", "utf8")
const channel = readFileSync("components/channel/chanelIdDesktop.tsx", "utf8")
const parts = readFileSync("components/channel/conversationHeaderParts.tsx", "utf8")

const headerOf = (src: string) => {
  const start = src.indexOf("<header")
  expect(start, "no <header> element").toBeGreaterThan(-1)
  return src.slice(start, src.indexOf("</header>", start))
}
const shellOf = (src: string) => {
  const start = src.indexOf("<header")
  return src.slice(start, src.indexOf(">", start) + 1)
}

describe("chat headers stay consistent", () => {
  it.each([
    ["h-[52px]", "52px, the sheet's header height"],
    ["border-b border-line", "the hairline below"],
    ["bg-sheet", "part of the sheet, opaque"],
    ["sticky top-0", "never scrolls away"],
    ["pl-5 pr-3", "the sheet's insets"],
  ])("every conversation header uses %s (%s)", (cls) => {
    for (const [name, src] of [["channel", channel], ["1:1", dm], ["group", group]] as const) {
      expect(shellOf(src), `${name} header missing ${cls}`).toContain(cls)
      expect(shellOf(src)).not.toContain("md:h-14")
    }
  })

  it("draws every title at the heading role (15/590)", () => {
    for (const src of [channel, dm, group]) expect(headerOf(src)).toMatch(/data-header-title='' className='truncate text-heading text-ink/)
  })

  it("gives a channel no hue: a monochrome # (a lock when private), no hued tile", () => {
    const h = headerOf(channel)
    expect(h).not.toContain("IdentityMark")
    expect(h).toMatch(/<Hash className='size-\[18px\] shrink-0 text-ink-3'/)
    expect(h).toContain("<Lock")
  })

  it("makes the channel's name and topic one button: its details", () => {
    expect(headerOf(channel)).toMatch(/aria-label='Channel details'/)
  })

  it("keeps at most three trailing controls beside who is here", () => {
    const right = headerOf(channel).split("<MemberStack")[1] ?? ""
    const controls = (right.match(/<HuddleButton|aria-label='Search'|aria-label="More channel actions"/g) || []).length
    expect(controls).toBe(3)
    expect(headerOf(channel)).not.toContain("<NotificationBell")
  })

  it("never cycles notifications on a click: a radio menu", () => {
    for (const src of [channel, dm, group]) {
      expect(src).not.toContain("getNextNotification")
      expect(src).toContain("<NotificationSubmenu")
    }
    expect(parts).toContain("DropdownMenuRadioGroup")
  })

  it("puts the More menus on the floating material at w-64, destructive items in ink", () => {
    expect(channel).toContain('<DropdownMenuContent align="end" className="pop-surface w-64 p-1">')
    expect(channel).not.toMatch(/bg-destructive/)
  })

  it("labels every icon button on hover, in all three", () => {
    for (const src of [channel, dm, group]) {
      const h = headerOf(src)
      const icons = (h.match(/size='icon'/g) || []).length
      const tips = (h.match(/<WithTooltip/g) || []).length
      expect(tips, "every icon button has a tooltip").toBeGreaterThanOrEqual(icons)
    }
  })

  it("gives a DM its status line, and an agent its provenance instead of Huddle", () => {
    const h = headerOf(dm)
    expect(h).toContain("data-header-meta")
    expect(h).toContain("Acts for you · can do only what you can")
    expect(h).toMatch(/\{!isBotPeer && \(\s*<FeatureGate feature=\{FEATURE_CALLS\}>\s*<HuddleButton/)
  })

  it("draws the live huddle in moss with one halo, never a ping", () => {
    expect(parts).toContain("bg-camp-moss-tint")
    expect(parts).toContain("motion-safe:animate-live-halo")
    for (const src of [channel, dm, group]) expect(src).not.toMatch(/animate-ping/)
  })
})
