import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildPrimaryNavLinks } from "@/lib/nav/primaryNavLinks"
import { GO_KEYS } from "@/lib/goKeys"
import { pageTitle } from "@/lib/utils/pageTitle"
import { SETTINGS_SECTIONS } from "@/lib/settingsSections"

// A place has one name, in sentence case, wherever the shell names it: the
// sidebar, the phone's top bar and menus, the keyboard list and the window's
// title. "My Tasks" in the sidebar sat over "My tasks" in the palette, the
// desktop menu said "Log out" where the phone said "Sign out", and the phone's
// bar said "Agents & skills" over a page called "Agents and skills".

const root = resolve(__dirname, "..", "..")

/** Words that keep their capitals: names, and the initialisms we write in capitals. */
const NAMES = new Set(["OneCamp", "AI", "DMs", "API", "GitHub", "Gmail", "Slack", "MCP", "SSO"])

/** Product names of more than one word, read as one name. */
const PRODUCTS = ["Google Calendar"]

/** The first title-cased word after the first, if any ("My Tasks" gives "Tasks"). */
function titleCasedWord(label: string): string | undefined {
  return PRODUCTS.reduce((l, p) => l.replaceAll(p, "product"), label)
    .split(/\s+/)
    .slice(1)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .find((w) => w && !NAMES.has(w) && /^\p{Lu}\p{Ll}/u.test(w))
}

/** Labels written as string literals in a file, for the places that build them inline. */
function literals(file: string, pattern: RegExp): string[] {
  const src = readFileSync(join(root, file), "utf8")
  return [...src.matchAll(pattern)].map((m) => m[1])
}

describe("the shell names each place once, in sentence case", () => {
  it("in the sidebar, the keyboard list, the window title and the settings list", () => {
    const labels = [
      ...buildPrimaryNavLinks(["", "app", "home"], { channel: 0, dm: 0, activity: 0 }, true).map((l) => l.title),
      ...GO_KEYS.map((g) => g.label),
      ...["myTask", "channel", "chat", "doc", "board", "tables", "templates", "settings", "ai"].map((s) =>
        pageTitle(`/app/${s}`).split(" · ")[0],
      ),
      ...SETTINGS_SECTIONS.map((s) => s.label),
    ]
    expect(labels.filter((l) => titleCasedWord(l))).toEqual([])
    expect(labels).toContain("My tasks")
  })

  it("in the phone's top bar and every phone drawer", () => {
    const drawers = readdirSync(join(root, "components/drawers")).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    const labels = [
      ...literals("components/navigationBar/mobile/mobileTopNavigationBarSecond.tsx", /return\s+"([^"]+)"/g),
      ...drawers.flatMap((f) => literals(`components/drawers/${f}`, /\blabel="([^"]+)"/g)),
      ...drawers.flatMap((f) => literals(`components/drawers/${f}`, /<DrawerTitle[^>]*>([^<{]+)<\/DrawerTitle>/g)),
    ]
    expect(labels.length).toBeGreaterThan(20)
    expect(labels.filter((l) => titleCasedWord(l))).toEqual([])
  })

  it("signs out with the words that sign in", () => {
    const menus = [
      "components/navigationBar/desktop/desktopNavigationUserProfile.tsx",
      "components/ui/CommandPalette.tsx",
      "components/drawers/userProfileDrawer.tsx",
    ].map((f) => readFileSync(join(root, f), "utf8"))
    for (const src of menus) {
      expect(src).toMatch(/Sign out/)
      expect(src).not.toMatch(/(?:label: |>\s*)"?Log out/)
    }
  })
})
