import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { chainOf, reach, sourceOf } from "../../scripts/fluidity/reach.mjs"

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

// The shell and the lists navigate without the address (21 Oct 2026). Next's
// useRouter() (16.3) draws its caller again on every address write,
// history.replaceState included, so every component that called it drew
// again on a calendar's J, a list's filter, a page's tab: the whole shell (54
// draws over three such writes in shellRenders.test.tsx), every row. They
// take the router's moves from useAppRouter (lib/navigation/appRouter).

// What the shell keeps mounted once it has come: the profile menu's body, the
// palette, and the right panel's bodies (rightPanel's panelLoaders); and Home,
// the first screen (FLUIDITY's query-write probe writes on it).
const SHELL = [
  "app/layout.tsx",
  "app/app/layout.tsx",
  "app/app/home/page.tsx",
  "components/navigationBar/desktop/ProfileMenuBody.tsx",
  "components/ui/CommandPalette.tsx",
  "components/rightPanel/taskInfoPanel.tsx",
  "components/rightPanel/docCommentList.tsx",
  "components/rightPanel/eventInfoPanel.tsx",
  // The sidebar's page tree, a chunk of its own once its section opens (components/docTree/DocsSection).
  "components/docTree/DocsTreeGroups.tsx",
]

// Lists, what they draw once an item, and the composer's command surface (one
// a conversation, open beside the calendar or the page in split view).
const LISTS = [
  "components/activity/activityFeedList.tsx",
  // The calendar writes its date to the address on every J and K.
  "components/calendar/calendarApp.tsx",
  "components/command/useCommandRunner.ts",
  "components/channel/channelMessageMobile.tsx",
  "components/chat/chatMessageMobile.tsx",
  "components/doc/RestoreRow.tsx",
  "components/docTree/DocRowMenu.tsx",
  "components/docTree/DocTree.tsx",
  "components/groupChat/groupChatMessageMobile.tsx",
  "components/liveEntity/EntityChip.tsx",
  "components/minimal-tiptap/extensions/board-embed/BoardEmbedView.tsx",
  "components/minimal-tiptap/extensions/subpage/SubpageView.tsx",
  "components/minimal-tiptap/extensions/task-list-embed/TaskListEmbedView.tsx",
  "components/mobileMessage/mobileMessage.tsx",
  "components/myTask/myTaskList.tsx",
  "components/myTask/myTaskTable.tsx",
  "components/project/projectTaskKanban.tsx",
  "components/project/projectTaskList.tsx",
  "components/project/projectTaskTable.tsx",
  "components/task/taskListTask.tsx",
]

const THE_ROUTER = "lib/navigation/appRouter.tsx"
const callsUseRouter = (f: string) => f !== THE_ROUTER && /\buseRouter\s*\(/.test(sourceOf(f))

describe("the shell and the lists, navigating", () => {
  it("call Next's useRouter nowhere the shell reaches", () => {
    const files = reach(SHELL)
    const offenders = [...files.keys()].filter(callsUseRouter).map((f) => chainOf(files, f))
    expect(offenders).toEqual([])
    expect(files.has(THE_ROUTER)).toBe(true)
  })

  it("call it in no list or row", () => {
    expect(LISTS.filter(callsUseRouter)).toEqual([])
  })

  it("count every body the right panel can show as the shell's", () => {
    const loaders = read("components/rightPanel/rightPanel.tsx").match(/panelLoaders = \{[\s\S]*?\n\};/)?.[0] ?? ""
    const bodies = [...loaders.matchAll(/import\("@\/([^"]+)"\)/g)].map((m) => `${m[1]}.tsx`)
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.filter((b) => !SHELL.includes(b))).toEqual([])
  })
})
