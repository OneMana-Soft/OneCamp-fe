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
const sectionsSource = readFileSync(join(process.cwd(), "lib/adminSections.ts"), "utf8")

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
      rawSource + sectionsSource,
      "the AI Models tab and its AI-only cards are removed from this non-AI snapshot",
    ).not.toMatch(/value="ai-models"|key: "ai-models"/)
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

/**
 * A deep link to a gated tab must land on that tab.
 *
 * The transcription tab exists only when the server has LiveKit behind it, and
 * the page cannot know that until the config request answers. It used to pick
 * its tab ONCE from the two-state hook, which reports "no" while that request is
 * in flight, through an uncontrolled `defaultValue`. So a cold load of
 * /app/admin?tab=transcription opened on Teams and stayed there.
 */
describe("admin page honours a deep link to a gated tab", () => {
    it("does not pick the tab once from a fallback", () => {
        expect(rawSource, "an uncontrolled Tabs cannot change its mind when the config arrives").not.toMatch(
            /<Tabs[\s\S]{0,200}defaultValue=/,
        )
        // Controlled by the section shown: the requested one while the server
        // hasn't answered (so nothing is marked), the chosen one after.
        expect(rawSource).toMatch(/<Tabs[\s\S]{0,200}value=\{shownTab\}/)
        expect(rawSource).toMatch(/const shownTab = waitingOnRequestedTab \? requestedTab : activeTab/)
    })

    it("asks the three-state hook, not the two-state one, for the gated tab", () => {
        // useFeature collapses "not known yet" into "no", which is the exact
        // collapse that sent the deep link to Teams.
        expect(rawSource).not.toMatch(/useFeature\(FEATURE_(AI|CALLS)\)/)
        expect(rawSource).toMatch(/useFeatureState\(FEATURE_CALLS\)/)
    })

    it("waits for the answer rather than rendering Teams and correcting itself", () => {
        expect(rawSource).toMatch(/waitingOnRequestedTab \?/)
    })
})

/**
 * One import tab, and the old address still works.
 *
 * "Slack Import" and "Import" sat next to each other with the same icon and no
 * way to tell which held what, so an admin looking for their migration had to
 * open both and read the cards. They answer one question — how do I get my
 * existing work in — and the pipeline behind them takes eight providers, of
 * which Slack is one.
 *
 * The alias is not optional: links to ?tab=slack-import exist in the wild, and a
 * merged tab that broke its own old address would be a worse fix than the
 * confusion it removed.
 */
describe("import is one tab", () => {
    it("does not offer two tabs for the same question", () => {
        expect(sectionsSource).not.toMatch(/key: "slack-import"/)
        expect(sectionsSource).toMatch(/key: "import"/)
    })

    it("keeps both cards, so nothing was dropped in the merge", () => {
        expect(rawSource).toMatch(/<SlackImportCard \/>/)
        expect(rawSource).toMatch(/<ImportCard \/>/)
    })

    it("still resolves the old address", () => {
        expect(rawSource).toMatch(/"slack-import": "import"/)
    })

    it("spaces the two cards, like every other multi-card tab", () => {
        // The bug this file already guards: a tab that gains a second card and no
        // wrapper renders them flush and reads as one section.
        const tab = rawSource.match(/<TabsContent value="import"[\s\S]*?<\/TabsContent>/)?.[0] ?? ""
        expect(tab).toContain("ADMIN_SECTION_STACK")
    })
})

/**
 * The sections are grouped in the settings nav (design v3, admin §1.1), from
 * one list (lib/adminSections), and the page has a TabsContent for each.
 */
describe("admin sections are grouped", () => {
    const adminKeys = [...sectionsSource.matchAll(/key: "([^"]+)",[\s\S]*?href: admin\("([^"]+)"\)/g)].map((m) => m[2])

    it("puts every admin section in the map exactly once", () => {
        expect(adminKeys.length).toBeGreaterThan(15)
        expect(new Set(adminKeys).size, "a section listed twice appears twice in the nav").toBe(adminKeys.length)
    })

    it("has a TabsContent for every section in the nav, and none without one", () => {
        const contents = [...rawSource.matchAll(/<TabsContent\s+value="([^"]+)"/g)].map((m) => m[1]).sort()
        expect(contents).toEqual([...adminKeys].sort())
    })

    it("keeps General to the workspace, with access and the audit log in their own sections", () => {
        const general = rawSource.match(/<TabsContent value="settings"[\s\S]*?<\/TabsContent>/)?.[0] ?? ""
        expect(general).not.toMatch(/<GuestAccessCard|<ScimProvisioningCard|<AdminAuditLog|<RetentionCard/)
        expect(rawSource).toMatch(/<TabsContent value="security"[\s\S]*?<GuestAccessCard \/>[\s\S]*?<\/TabsContent>/)
        expect(rawSource).toMatch(/<TabsContent value="audit"[\s\S]*?<AdminAuditLog \/>[\s\S]*?<\/TabsContent>/)
    })

    it("still sends the old audit log address to the audit log", () => {
        expect(sectionsSource).toMatch(/raw === "settings" && hash === "#audit-log"\) return "audit"/)
        expect(rawSource).toMatch(/normaliseAdminTab\(rawTab, hash\)/)
    })

    it("no longer scrolls a strip of tabs sideways, or draws a menu in the page", () => {
        expect(pageSource).not.toMatch(/scrollTabs|tabsScrollRef|<TabsList|<TabsTrigger|<select/)
    })
})

/**
 * A section's code comes when the pointer or focus reaches its row in the
 * settings nav, so opening it rarely waits.
 */
describe("admin sections load ahead of the click", () => {
    const preload = readFileSync(join(process.cwd(), "components/admin/adminPreload.ts"), "utf8")
    const nav = readFileSync(join(process.cwd(), "components/navigationBar/desktop/SettingsNav.tsx"), "utf8")

    it("preloads a section when the pointer or focus reaches its nav row", () => {
        expect(nav).toMatch(/onPointerEnter=\{place\.group !== "you" \? \(\) => preloadAdminSection\(place\.key\)/)
        expect(nav).toMatch(/onFocus=\{place\.group !== "you" \? \(\) => preloadAdminSection\(place\.key\)/)
    })

    it("has a preload for every section the page loads lazily", () => {
        const keys = [...sectionsSource.matchAll(/href: admin\("([^"]+)"\)/g)].map((m) => m[1]).filter((v) => v !== "users")
        const missing = keys.filter((v) => !new RegExp(`(^|\\s)"?${v}"?: \\(\\) =>`, "m").test(preload))
        expect(missing).toEqual([])
    })
})

/**
 * Colour (design v3, admin §1.5): the nav carries no tiles; each section's one
 * hue is on its page header's tile, one hue per group.
 */
describe("admin colours", () => {
    it("gives every admin group one hue", () => {
        const block = sectionsSource.slice(sectionsSource.indexOf("export const SETTINGS_GROUP_HUE"), sectionsSource.indexOf("}", sectionsSource.indexOf("export const SETTINGS_GROUP_HUE")))
        const keys = [...block.matchAll(/^\s+(\w+): "/gm)].map((m) => m[1])
        expect(keys).toEqual(["workspace", "ai", "connections", "records", "system"])
    })

    it("draws the section's hue on the page header's tile, and no tile in the nav", () => {
        expect(rawSource).toMatch(/<PageFrameHeader[\s\S]{0,80}hue=\{place\.hue\}/)
        const nav = readFileSync(join(process.cwd(), "components/navigationBar/desktop/SettingsNav.tsx"), "utf8")
        expect(nav).not.toMatch(/<Tile\b/)
    })
})
