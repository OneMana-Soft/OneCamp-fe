import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Scroll and spacing invariants for the admin page.
 *
 * WHY THESE ARE TESTED AT ALL. Both faults these cover were invisible in review, because both are
 * about something ABSENT.
 *
 * The scroll one: the page used to comment "each card owns its own internal scrolling". That holds
 * for a tab with one card and breaks the moment a second is added, which had already happened on two
 * tabs. AIModelsCard was h-full with its own overflow-y-auto, so it filled the visible region and
 * scrolled inside itself while AgentDelegationCard, MCPServerCard and AIActivityCard sat below it,
 * reachable only via the app shell's scroller. Two scrollbars, different meanings; using the outer
 * one scrolled the header and tab strip away, and far enough down the inner scrollport was itself
 * off-screen so content stayed clipped with no reachable scrollbar.
 *
 * The spacing one: three tabs hold multiple cards, and one of them had no spacing wrapper, so its
 * cards rendered flush and read as a single section. Nothing about that looks wrong in a diff —
 * appending a card to a tab is a one-line change, and the missing wrapper is not on that line.
 *
 * These are asserted against the SOURCE TEXT rather than a render. A render test would need the whole
 * admin tree — 20+ cards, each fetching — to check two class names, and would fail for reasons that
 * have nothing to do with layout. What matters here is a structural rule about the file, so the file
 * is what gets checked.
 */

const rawSource = readFileSync(join(process.cwd(), "app/app/admin/page.tsx"), "utf8")

/**
 * Strips comments, so the checks below read CODE and not prose about code.
 *
 * Not a nicety. The first version of this file counted occurrences of "overflow-y-auto" in the raw
 * source and found three: one real class and two mentions in the comment explaining why there is only
 * one. A structural check that its own documentation can break is a check people delete.
 *
 * Line comments are only stripped when the `//` starts a line, so a `https://` inside a string
 * survives.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* block */
    .replace(/^[ \t]*\/\/.*$/gm, "") // // line, at line start only
}

const pageSource = stripComments(rawSource)

describe("admin page scroll ownership", () => {
  it("has exactly one scroll container", () => {
    const scrollers = pageSource.match(/overflow-y-auto/g) ?? []
    expect(
      scrollers.length,
      "The tab content region is the only place on this page that may scroll. A second " +
        "overflow-y-auto means two scrollbars with different meanings, which is the bug this " +
        "replaced. If a card genuinely needs to scroll internally, that is a design decision to " +
        "make deliberately and document here.",
    ).toBe(1)
  })

  it("does not put h-full on any TabsContent", () => {
    // h-full is what made a card believe it owned the viewport. With the region scrolling instead,
    // TabsContent must size to its content — and because a percentage height against an auto-height
    // parent resolves to auto, re-adding h-full here would silently re-enable every card's dormant
    // internal scroller at once.
    const offenders = [...pageSource.matchAll(/<TabsContent[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => tag.includes("h-full"))

    expect(
      offenders,
      "TabsContent must not set h-full; the tab region scrolls and cards size to their content",
    ).toEqual([])
  })

  it("keeps the region a flex child that can actually shrink", () => {
    // min-h-0 is the non-obvious half. Without it a flex child refuses to shrink below its content,
    // so the region grows past the viewport and the app shell scrolls instead — reintroducing the
    // outer scrollbar and the disappearing header, with overflow-y-auto still present and looking
    // correct.
    expect(
      pageSource,
      "the scroll region needs flex-1 min-h-0 or it will not constrain, and the shell will scroll",
    ).toContain("flex-1 min-h-0 overflow-y-auto")
  })
})

describe("admin page optional subsystems", () => {
  it("does not include an AI Models tab in the non-AI snapshot", () => {
    expect(
      rawSource,
      "the AI Models tab and its AI-only cards are removed from this non-AI snapshot",
    ).not.toMatch(/value: "ai-models"/)
  })

  it("hides the Transcription tab when calling is unavailable", () => {
    expect(
      rawSource,
      "call transcription settings are meaningless without LiveKit; the tab must follow FEATURE_CALLS",
    ).toMatch(/if \(tab\.value === "transcription"\) return callsAvailable/)
  })
})

describe("admin page section spacing", () => {
  it("defines the section rhythm once", () => {
    expect(
      pageSource,
      "spacing between top-level cards is one named constant so tabs cannot drift apart",
    ).toMatch(/const ADMIN_SECTION_STACK = "space-y-\d+"/)
  })

  it("wraps every multi-card tab in the shared stack", () => {
    // Each TabsContent's body, so children can be counted per tab.
    const tabs = [...pageSource.matchAll(/<TabsContent\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/TabsContent>/g)]

    expect(tabs.length, "no TabsContent blocks matched — this check is enforcing nothing").toBeGreaterThan(10)

    const unwrapped: string[] = []
    for (const [, value, body] of tabs) {
      // Direct card children, i.e. self-closing PascalCase elements.
      const cards = body.match(/<[A-Z][A-Za-z0-9]*\s*\/>/g) ?? []
      if (cards.length > 1 && !body.includes("ADMIN_SECTION_STACK")) {
        unwrapped.push(`${value} (${cards.length} cards)`)
      }
    }

    expect(
      unwrapped,
      "these tabs render several cards with no spacing between them, so they read as one " +
        "section. Wrap the children in <div className={ADMIN_SECTION_STACK}>.",
    ).toEqual([])
  })
})
