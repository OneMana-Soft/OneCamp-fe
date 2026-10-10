import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Task, goal, project and cycle progress fills with the theme's progress
// (bg-progress: the logo's gradient in the house theme, the accent in the
// others), never a hard-coded ink. Wave 1 drew them in foreground/70.
const root = join(__dirname, "../..")
const FILES = [
  "components/goals/GoalProgress.tsx",
  "components/task/cyclesButton.tsx",
  "components/project/ProjectsOverview.tsx",
  "components/project/ProjectsTimeline.tsx",
  "app/guest/p/[token]/page.tsx",
]

describe("progress bars in tasks and projects", () => {
  for (const f of FILES) {
    it(`${f} fills with the theme's progress`, () => {
      const src = readFileSync(join(root, f), "utf8")
      // A file may draw the bar itself, or use the app's shared one (the
      // client view's header does), which fills with bg-progress below.
      const shared = /from "@\/components\/ui\/progress"/.test(src) && /<Progress\b/.test(src)
      if (!shared) expect(src).toMatch(/\bbg-progress\b/)
      expect(src).not.toMatch(/bg-foreground\/70/)
    })
  }

  it("the app's shared progress bar fills with the theme's progress", () => {
    const src = readFileSync(join(root, "components/ui/progress.tsx"), "utf8")
    expect(src).toMatch(/\bbg-progress\b/)
    expect(src).not.toMatch(/bg-foreground\/70/)
  })
})
