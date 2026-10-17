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
    for (const src of [channel, dm, group]) expect(headerOf(src)).toMatch(/data-header-title='' className='[^']*\btruncate text-heading text-ink/)
  })

  it("keeps the name when the header is narrow: what follows it shrinks and goes first", () => {
    // With a thread open beside it at 1024 the channel header was 360px wide,
    // and its name truncated to nothing while "Add a topic" kept its width.
    for (const src of [channel, dm]) {
      const h = headerOf(src)
      expect(h).toMatch(/<header className='@container\/chathead /)
      expect(h).toMatch(/data-header-title='' className='[^']*min-w-\[4ch\]/)
    }
    const topics = [...headerOf(channel).matchAll(/data-header-topic='' className='([^']*)'/g)].map((m) => m[1])
    expect(topics).toHaveLength(2)
    for (const t of topics) {
      expect(t).toContain("shrink-[8]")
      expect(t).not.toContain("shrink-0")
      expect(t).toContain("@[38rem]/chathead:block")
    }
  })

  // INTERACTION_SPEC D13: a channel wears its own hue, as the one tile the
  // sidebar and the list draw (a lock inside when private), never a grey #.
  it("draws the channel as its tile in its own hue, a lock when private", () => {
    const h = headerOf(channel)
    expect(h).not.toContain("IdentityMark")
    expect(h).toMatch(/<ChannelTile id=\{channelId\} isPrivate=\{!!channelInfo\.data\?\.channel_info\.ch_private\} size=\{20\} \/>/)
    expect(h).not.toMatch(/<Hash\b/)
  })

  it("makes the channel's name and topic one button: its details", () => {
    expect(headerOf(channel)).toMatch(/aria-label='Channel details'/)
  })

  it("keeps at most three trailing controls beside who is here", () => {
    const right = headerOf(channel).split("<MemberStack")[1] ?? ""
    const controls = (right.match(/<HuddleButton|aria-label=\{`Search in|aria-label="More channel actions"/g) || []).length
    expect(controls).toBe(3)
    expect(headerOf(channel)).not.toContain("<NotificationBell")
  })

  // Search opened the whole workspace's search, with the conversation lost (QA F-15).
  it("searches in the conversation, from each header", () => {
    expect(headerOf(channel)).toContain('href={searchWithinHref({ kind: "channel", id: channelId })}')
    expect(headerOf(dm)).toContain('href={searchWithinHref({ kind: "dm", id: chatId })}')
    expect(headerOf(group)).toContain('href={searchWithinHref({ kind: "group", id: grpId })}')
    for (const src of [channel, dm, group]) expect(headerOf(src)).not.toContain("href='/app/search'")
  })

  // "Offline" on a computer, "Away" on a phone, for the same person (QA F-18).
  it("says where a DM's person is by one rule, on a computer and a phone", () => {
    expect(dm).toContain("presenceOf(userStatusState, otherUserInfo.data?.data)")
    expect(dm).toContain("{PRESENCE_WORDS[presence]}")
    const phone = readFileSync("components/navigationBar/mobile/phoneConversationTitle.tsx", "utf8")
    expect(phone).toContain("PRESENCE_WORDS[presenceOf(state, person)]")
    expect(phone).not.toContain('"Active now"')
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
