import { describe, expect, it } from "vitest"

import { chainOf, walk } from "../scripts/fluidity/reach.mjs"

// The Connected panel (the work graph, DG5) sits on five views: a doc, a
// task, a project, a channel and a person. Each view carries its button
// (components/workGraph/ConnectedTrigger) and nothing more; the panel, its
// list, its finder, the sheet and the search come with the first press. This
// walks the static imports from each place the button is drawn and fails,
// naming the chain, if the panel's code is reached again.
const PANEL = ["components/workGraph/ConnectedOverlay.tsx", "components/workGraph/ConnectedList.tsx", "components/workGraph/ConnectionFinder.tsx", "components/workGraph/GraphRow.tsx"]
const VIEWS = [
  "components/workGraph/ConnectedTrigger.tsx",
  "components/workGraph/LazyConnected.tsx",
  "components/docEditor/DocHeader.tsx",
  "components/navigationBar/mobile/mobileTopNavigationBarThirdDoc.tsx",
  "components/navigationBar/mobile/mobileTopNavigationBarThird.tsx",
  "components/rightPanel/RightPanelTaskHeader.tsx",
  "components/project/projectTaskDesktop.tsx",
  "components/channel/chanelIdDesktop.tsx",
  "components/dialog/otherUserProfileDialog.tsx",
  "components/profile/mobileOtherUserProfile.tsx",
]

function panelReach(entries: string[]): string[] {
  const { files } = walk(entries) as { files: Map<string, string | null> }
  return PANEL.filter((p) => files.has(p)).map((p) => `${p}: ${chainOf(files, p)}`)
}

describe("the Connected panel loads on its first press", () => {
  it("is never a static import of a view that offers it", () => {
    expect(panelReach(VIEWS)).toEqual([])
  })

  it("would see one: the panel, walked from, brings its list", () => {
    expect(panelReach(["components/workGraph/ConnectedOverlay.tsx"]).length).toBeGreaterThan(0)
  })
})
