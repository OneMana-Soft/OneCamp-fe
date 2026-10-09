import { afterEach, describe, expect, it } from "vitest"
import { lastTaskProject, projectAt, rememberTaskProject, startingProject } from "./startingProject"

const projects = [{ project_uuid: "launch" }, { project_uuid: "onboarding" }]

describe("startingProject", () => {
    afterEach(() => localStorage.clear())

    it("starts where the last task was made, while that project is still there", () => {
        expect(startingProject(projects, "onboarding")).toBe("onboarding")
        expect(startingProject(projects, "deleted-since")).toBe("")
    })

    it("picks the only project, and guesses nothing among several", () => {
        expect(startingProject([{ project_uuid: "launch" }], "")).toBe("launch")
        expect(startingProject(projects, "")).toBe("")
        expect(startingProject([], "launch")).toBe("")
        expect(startingProject(undefined, "launch")).toBe("")
    })

    it("remembers the project a task was made in", () => {
        expect(lastTaskProject()).toBe("")
        rememberTaskProject("launch")
        expect(lastTaskProject()).toBe("launch")
    })
})

// The command palette's New task starts in the project whose page it's opened on.
describe("projectAt", () => {
    it("is the project a project's page shows", () => {
        expect(projectAt("/app/project/p1")).toBe("p1")
        expect(projectAt("/app/project/p1/settings")).toBe("p1")
    })

    it("is none anywhere else", () => {
        expect(projectAt("/app/project")).toBe("")
        expect(projectAt("/app/project/")).toBe("")
        expect(projectAt("/app/projects/p1")).toBe("")
        expect(projectAt("/app/task/t1")).toBe("")
        expect(projectAt(null)).toBe("")
        expect(projectAt(undefined)).toBe("")
    })
})
