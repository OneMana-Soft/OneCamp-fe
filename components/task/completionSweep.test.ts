import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The old green sweep (raw rgba green, 1.2s) played beside the camp-hued
// sparks on Mark complete, a list row and a subtask. The sparks replace it
// (owner's decision, 10 Oct).
describe("completing a task", () => {
  it("no longer plays the old green sweep anywhere", () => {
    for (const f of ["app/globals.css", "components/rightPanel/RightPanelTaskHeader.tsx", "components/task/subtasksSection.tsx", "components/task/taskListTask.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\.?animate-gradient-completion|waveCompletion/)
    }
  })
})
