import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * One celebration per finish, from the thing that finished (work.md W04).
 * Routine edits never celebrate, so every call to celebrate or one of its
 * tiers must come from a file on this list, each a finish:
 *   - a task completed: its check (row, phone row, panel header), and a
 *     board card dropped into Done;
 *   - all subtasks done (Ring), a goal reached or a project at 100 % (Camp),
 *     a cycle completed (Ring);
 *   - and, outside the work area, the moments the playful layer named before.
 */
const ROOT = process.cwd()
const ALLOWED = new Set([
  "lib/celebrate.ts",
  // Its API for every screen, the bursts loaded on the side.
  "lib/celebrateSoon.ts",
  "components/task/TaskCheck.tsx",
  "components/task/taskListTask.tsx",
  "components/kanbanComponents/TaskBoard.tsx",
  "components/rightPanel/RightPanelTaskHeader.tsx",
  "components/task/subtasksSection.tsx",
  "components/goals/GoalPage.tsx",
  "components/goals/GoalsView.tsx",
  "components/project/ProjectHeaderLine.tsx",
  "components/task/cyclesSwitcher.tsx",
  "components/guest/GuestReview.tsx",
  // A form sent: the spark is its pages' Sent badge, for app/f/[token].
  "components/forms/FormPages.tsx",
  // The other v3 waves' finishes, met at the integration (11 Oct): a board's
  // vote closing on its winner (content), a booking confirmed (content), the
  // last item of a doc's checklist ticked (content), your first reaction on a
  // message (chat, three small sparks) and the first message in a new
  // conversation (chat).
  "components/board/boardFacilitation.tsx",
  "components/booking/BookingFlow.tsx",
  "components/docEditor/docInput.tsx",
  "components/message/reactionPill.tsx",
  "lib/chat/celebrateFirst.ts",
  // The admin wave's: the workspace set up at the end of first run.
  "app/admin-setup/page.tsx",
])

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.(t|j)sx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

/** Callers outside the work area that predate this rule (onboarding, imports, first message). */
const ELSEWHERE = /^(components\/(onboarding|admin|home|chat|messages|channel|textInput|later|inbox|connect|doc|posts|ai|banner)\/|app\/(app|onboarding)\/)/

describe("who may celebrate", () => {
  it("only the finishes on the list call celebrate in the work area", () => {
    const offenders: string[] = []
    for (const file of ["components", "app", "lib", "hooks"].flatMap((d) => files(join(ROOT, d)))) {
      const rel = relative(ROOT, file)
      if (ALLOWED.has(rel) || ELSEWHERE.test(rel)) continue
      if (/\bcelebrate(?:Task|Ring|Camp)?\(/.test(readFileSync(file, "utf8"))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
