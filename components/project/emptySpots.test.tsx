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
    expect(screen.getByText("65%")).toBeTruthy()
  })
})

// The list empties live in tables and pages that need a server to render;
// their spots are pinned at the source (the empty states the playful layer
// illustrates: no tasks, nothing assigned, no projects).
const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8")
describe("empty lists have their spot", () => {
  it.each([
    ["components/project/projectTaskTable.tsx", /illustration=\{<SpotTasks hue=\{hueFor\(projectId\)\} \/>\}/],
    ["components/myTask/myTaskTable.tsx", /illustration=\{<SpotTasks \/>\}/],
    ["components/myTask/myTaskList.tsx", /illustration=\{isFiltered \? undefined : <SpotTasks \/>\}/],
    ["components/project/ProjectsOverview.tsx", /illustration=\{<SpotWelcome hue="sky" \/>\}/],
  ])("%s", (file, spot) => {
    expect(read(file)).toMatch(spot)
  })
})
