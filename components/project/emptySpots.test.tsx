import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/hooks/useGoals", () => ({ useProjectGoals: () => [{ id: "g1", title: "Launch the Business tier", progress: 0.65 }] }))

const { ProjectGoalChip } = await import("@/components/goals/ProjectGoalChip")

afterEach(cleanup)

describe("the goal a project serves", () => {
  it("shows how far it is as a ring, with the figure beside the title", () => {
    render(<ProjectGoalChip projectId="p" />)
    expect(screen.getByRole("progressbar", { name: "Launch the Business tier: 65%" })).toBeTruthy()
    expect(screen.getByText("· 65%")).toBeTruthy()
  })

  it("lets its name give way with an ellipsis, keeping the figure whole (PTC-43)", () => {
    render(<ProjectGoalChip projectId="p" />)
    expect(screen.getByText("Launch the Business tier").className).toContain("truncate")
    expect(screen.getByText("· 65%").className).toContain("shrink-0")
  })

  it("takes a finger's 44px, as a 24px chip in the header (PG2-19)", () => {
    render(<ProjectGoalChip projectId="p" />)
    expect(screen.getByRole("link").hasAttribute("data-touch-target")).toBe(true)
  })
})

// The list empties live in tables and pages that need a server to render;
// their spots are pinned at the source (the empty states the playful layer
// illustrates: no tasks, nothing assigned, no projects).
const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8")
describe("empty lists have their spot", () => {
  it.each([
    ["components/project/projectTaskTable.tsx", /illustration=\{<SpotTasks hue=\{projectHue\} \/>\}/],
    ["components/myTask/myTaskTable.tsx", /illustration=\{<SpotTasks \/>\}/],
    ["components/myTask/myTaskList.tsx", /illustration=\{isFiltered \? undefined : <SpotTasks \/>\}/],
    ["components/project/ProjectsOverview.tsx", /illustration=\{<SpotWelcome hue="sky" \/>\}/],
  ])("%s", (file, spot) => {
    expect(read(file)).toMatch(spot)
  })
})
