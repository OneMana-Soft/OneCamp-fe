import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// The shell reads the path, never the query (FLUIDITY-LEAD, 20 Oct 2026). A
// query write (a calendar's date on each press of J, a project's tab, a
// list's filters) gave LayoutContent a new useSearchParams() and rendered the
// shell and everything it draws: 672 component renders a press of J on beta
// 482460c3d (critic/FOLLOWUPS.md: "every address write re-renders
// LayoutContent"). Only OpenFromUrl, a leaf, reads it now.

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")
const LAYOUT = read("app/app/LayoutContent.tsx")

describe("the shell and the address's query", () => {
  it("reads the query in one leaf, OpenFromUrl, beside the shell", () => {
    expect(LAYOUT).toMatch(/function OpenFromUrl\(\) \{\s*useOpenFromUrl\(\);\s*return null;\s*\}/)
    expect(LAYOUT).toMatch(/<OpenFromUrl \/>\s*<Shell>\{children\}<\/Shell>/)
    const shell = LAYOUT.slice(LAYOUT.indexOf("function Shell("))
    expect(shell).not.toMatch(/useSearchParams|useOpenFromUrl\(\)/)
  })

  it("calls no hook that reads the query", () => {
    for (const f of [
      "hooks/useSplitView.ts",
      "hooks/useGoKeys.ts",
      "hooks/useBotKinds.ts",
      "components/navigationBar/desktop/desktopNavigationBar.tsx",
      "components/navigationBar/mobile/mobileNavigationBar.tsx",
      "components/ui/PageTransition.tsx",
    ])
      expect(read(f), f).not.toMatch(/useSearchParams/)
  })
})
