import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"

// A DM header and a group-chat header are the same object at different arities.
// They drifted: the group one was a plain div at text-lg with p-2, no height, no
// sticky and no background, so beside a DM it sat at a different height, scrolled
// away with the messages, and let the thread show through it.
//
// Source-level rather than a render test: both components need Redux, SWR, MQTT
// and a router to mount, and what matters is the shell they share.
const dm = readFileSync("components/chat/chatIdDesktop.tsx", "utf8")
const group = readFileSync("components/groupChat/chatGrpIdDesktop.tsx", "utf8")
// The channel header was the third dialect and the worst of them: a plain div
// at text-lg with p-2, no height, not sticky and not opaque, so it scrolled
// away with the conversation and let the thread show through it. That is the
// collision people saw when a thread or the AI panel was open beside it.
const channel = readFileSync("components/channel/chanelIdDesktop.tsx", "utf8")

const headerOf = (src: string) => {
  const start = src.indexOf("<header")
  expect(start, "no <header> element").toBeGreaterThan(-1)
  return src.slice(start, src.indexOf(">", start) + 1)
}

describe("chat headers stay consistent", () => {
  // The shell classes are the whole point: height, padding, border, background,
  // stickiness and the space-between that ranges actions right.
  it.each([
    ["h-12 md:h-14", "same height"],
    ["px-3 md:px-4", "same padding"],
    ["justify-between", "actions ranged right, not crammed by the title"],
    ["sticky top-0", "stays put while messages scroll"],
    ["bg-background", "opaque, so the thread does not show through"],
    ["border-b border-border/60", "same divider"],
  ])("every conversation header uses %s (%s)", (cls) => {
    expect(headerOf(dm), `1:1 header missing ${cls}`).toContain(cls)
    expect(headerOf(group), `group header missing ${cls}`).toContain(cls)
    expect(headerOf(channel), `channel header missing ${cls}`).toContain(cls)
  })

  // Both title lines are the same size and weight. The group one was text-lg,
  // which read as a different level of heading on an adjacent screen.
  it.each([
    ["1:1", dm],
    ["group", group],
    ["channel", channel],
  ])("%s title uses the shared type treatment", (_name, src) => {
    expect(src).toContain("text-sm font-semibold text-foreground truncate leading-tight")
  })

  // Both carry a muted second line, which is what keeps the two headers the same
  // height rather than one being visually shorter.
  it.each([
    ["1:1", dm],
    ["group", group],
    ["channel", channel],
  ])("%s header has a muted subtitle line", (_name, src) => {
    expect(src).toContain("text-2xs text-muted-foreground leading-tight")
  })

  // A header that scrolls sideways is the bug the old overflow-auto caused.
  it("no header scrolls on its own", () => {
    expect(headerOf(dm)).not.toContain("overflow-auto")
    expect(headerOf(group)).not.toContain("overflow-auto")
    expect(headerOf(channel)).not.toContain("overflow-auto")
  })

  // Eight icons in a row, every one of them carrying an aria-label and saying
  // nothing to anybody looking at it. The two AI ones were the least guessable
  // and the most worth finding.
  it("names the channel header's icon controls on hover, not only to a screen reader", () => {
    const actions = channel.slice(channel.indexOf("<header"), channel.indexOf("</header>"))
    const iconButtons = (actions.match(/size='icon'/g) || []).length
    const tooltips = (actions.match(/<WithTooltip/g) || []).length
    expect(iconButtons).toBeGreaterThan(4)
    expect(tooltips, "icon controls in the channel header with no visible name").toBeGreaterThanOrEqual(iconButtons - 1)
  })
})
