import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// One check for every list that turns something on (PTC-33). The filter menus
// each drew their own box, an orange outline faded when off, and seven more
// lists drew a check they hid with opacity-0 or invisible: some led the row,
// some ended it, some said nothing to a screen reader. They all draw the
// shared MenuCheck now: a list where several can be on leads its rows with it
// (CommandItem's `checked`, as a menu's checkbox row has it), and a list where
// one is current ends its rows with it (as a select's chosen option has it),
// each row saying which through aria-checked or aria-current.

vi.mock("@/components/tags/TagPicker", () => ({
  useProjectTags: () => ({ tags: [{ name: "Bug", count: 3 }, { name: "Design", count: 1 }] }),
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }) }))

const { TagFilter } = await import("@/components/tags/TagFilter")
const { StatusMenuContent } = await import("@/components/task/StatusMenu")

afterEach(cleanup)

const rowOf = (name: string) => screen.getByRole("option", { name: new RegExp(name) })
const markOf = (row: HTMLElement) => row.querySelector("[data-menu-check]")?.getAttribute("data-menu-check")

describe("a list where several can be on", () => {
  it("leads each row with the shared check and says it's on", () => {
    render(<TagFilter projectId="p1" active={["bug"]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Tag/ }))
    const bug = rowOf("Bug")
    const design = rowOf("Design")
    expect(bug.getAttribute("aria-checked")).toBe("true")
    expect(markOf(bug)).toBe("on")
    expect(design.getAttribute("aria-checked")).toBe("false")
    expect(markOf(design)).toBe("off")
    // Leading: the check comes before the row's words.
    expect(bug.firstElementChild?.hasAttribute("data-menu-check")).toBe(true)
  })
})

describe("a list where one is current", () => {
  it("ends the current row with the shared check and says it's the one", () => {
    render(<StatusMenuContent current="todo" onSelect={() => {}} />)
    const todo = screen.getAllByRole("option").find((o) => o.getAttribute("aria-checked") === "true")!
    expect(todo.textContent).toMatch(/To ?do/i)
    expect(markOf(todo)).toBe("on")
    expect(todo.lastElementChild?.querySelector("[data-menu-check]")).not.toBeNull()
    const others = screen.getAllByRole("option").filter((o) => o !== todo && o.hasAttribute("aria-checked"))
    expect(others.length).toBeGreaterThan(2)
    for (const o of others) expect(markOf(o)).toBe("off")
  })
})

// Every .tsx under a folder, tests aside.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe("no list draws a check of its own", () => {
  it("leaves no check hidden with opacity-0 or invisible to mark what's off", () => {
    // Not a list's check: a guide step's done mark, in its own ring, and a copy
    // button's tick, which crossfades with its copy icon once copied.
    const allowed = new Set(["components/admin/ApiTokensCard.tsx", "components/ui/settingsControls.tsx"])
    const drawn = [...sources("components"), ...sources("app")].filter((f) => {
      if (allowed.has(f)) return false
      const src = readFileSync(f, "utf8")
      return /<Check\b[^>]*(opacity-0|invisible)/.test(src)
    })
    expect(drawn).toEqual([])
  })

  // A check drawn only on the chosen row ({on && <Check />}, {on ? <Check /> : null}):
  // the rows' words shift as it comes and goes, and it says nothing to a screen
  // reader unless its row does. Counted per file, so a new one fails, and so
  // does a list moved onto MenuCheck that is still counted here.
  it("shows no check only on the chosen row, but where it isn't a list's or isn't moved yet", () => {
    const shownWhenChosen = (src: string) =>
      (src.match(/&&\s*<Check\b/g)?.length ?? 0) + (src.match(/\?\s*<Check\b[^>]*\/>\s*:\s*(null|undefined)\b/g)?.length ?? 0)
    // Not a list's check: the shared check itself, a subtask's own checkbox, a
    // done task's mark on its timeline bar, a checkbox cell's value, a tip's
    // "tried" mark and a colour swatch's tick.
    const notAList: Record<string, number> = {
      "components/ui/menuCheck.tsx": 1,
      "components/task/subtasksSection.tsx": 1,
      "components/project/timeline/TimelineBar.tsx": 1,
      "components/table/gridCells.tsx": 1,
      "components/onboarding/KeyboardTip.tsx": 1,
      "components/ui/paletteColorPicker.tsx": 1,
    }
    // Lists in other areas not on MenuCheck yet. DESIGN-BUILD-2's adoption sweep
    // moves each and takes it off here; once this is empty the rule is strict.
    const notYet: Record<string, number> = {
      "components/admin/AddAdminDialog.tsx": 1,
      "components/booking/BookingFlow.tsx": 1,
      "components/calendar/calendarsPopover.tsx": 1,
      "components/doc/DocsToolbar.tsx": 1,
      "components/docEditor/BlockSheet.tsx": 1,
      "components/docEditor/DocHeader.tsx": 1,
      "components/docEditor/SelectionBar.tsx": 1,
      "components/entityLink/EntityLinkPicker.tsx": 1,
      "components/minimal-tiptap/extensions/simple-table/TableMenu.tsx": 2,
      "components/searchDropdown/selectUserToMessageDropdown/selectUserToMessageDropdown.tsx": 1,
      "components/table/gridCells.tsx": 1,
      "components/task/cyclesButton.tsx": 1,
    }
    const counted: Record<string, number> = {}
    for (const f of [...sources("components"), ...sources("app")]) {
      const n = shownWhenChosen(readFileSync(f, "utf8"))
      if (n > 0 || f in notAList || f in notYet) counted[f] = n
    }
    const expected: Record<string, number> = {}
    for (const [f, n] of [...Object.entries(notAList), ...Object.entries(notYet)]) expected[f] = (expected[f] ?? 0) + n
    expect(counted).toEqual(expected)
  })

  it("has the filter menus and pickers set the row's own check", () => {
    for (const f of [
      "components/task/taskTableFieldFilter.tsx",
      "components/task/taskTableFacetedStatusFilter.tsx",
      "components/task/taskTableFacetedPriorityFilter.tsx",
      "components/task/taskTableFacetedAssigneeFilter.tsx",
      "components/task/taskTableFacetedProjectFilter.tsx",
      "components/task/taskKanbanColumnPriorityFilter.tsx",
      "components/task/taskKanbanProjectFilter.tsx",
      "components/tags/TagFilter.tsx",
      "components/tags/TagPicker.tsx",
      "components/task/BulkTaskBar.tsx",
      "components/task/taskFieldsSection.tsx",
      "components/goals/GoalDialog.tsx",
    ]) {
      const src = readFileSync(f, "utf8")
      expect(src, f).toMatch(/\bchecked=\{/)
      expect(src, f).not.toMatch(/rounded-sm border border-primary|<CheckMark\b/)
    }
    // Lists that pick one end their rows with the shared check and say which is chosen.
    for (const f of [
      "components/task/StatusMenu.tsx",
      "components/task/taskRowParts.tsx",
      "components/task/taskAssigneePicker.tsx",
      "components/task/taskSubTaskAssignee.tsx",
      "components/task/savedTaskViews.tsx",
      "components/combobox/userComboboxItem.tsx",
      "components/dialog/appLanguageCombobox.tsx",
      "components/goals/GoalsView.tsx",
      "components/project/ProjectsOverview.tsx",
      "components/project/ProjectAttachments.tsx",
    ]) {
      const src = readFileSync(f, "utf8")
      expect(src, f).toMatch(/<MenuCheck checked=/)
      expect(src, f).not.toMatch(/<Check\b/)
    }
    // Some of the chosen tasks carry a tag: its row shows the dash.
    expect(readFileSync("components/task/BulkTaskBar.tsx", "utf8")).toMatch(/state === "some" \? "indeterminate"/)
  })
})
