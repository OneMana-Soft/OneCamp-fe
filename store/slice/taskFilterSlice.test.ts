import { describe, expect, it } from "vitest"
import taskFilterSlice, { clearMyTaskSortingFilteringAndTask, clearProjectSortingFilteringAndTask } from "./taskFilterSlice"

// A filter value is always { sort: [], filters: [] }, never {}. The empty
// object was truthy, so readers' fallbacks never applied and My Tasks
// crashed on phones reading filters.length.
describe("task filter state", () => {
    const reducer = taskFilterSlice.reducer
    it("starts with real, empty arrays", () => {
        const s = reducer(undefined, { type: "@@init" })
        expect(s.myTaskSortingAndFilter.filters).toEqual([])
        expect(s.myTaskSortingAndFilter.sort).toEqual([])
    })
    it("is reset to real, empty arrays", () => {
        const s = reducer(undefined, clearMyTaskSortingFilteringAndTask())
        expect(s.myTaskSortingAndFilter.filters.length).toBe(0)
        const p = reducer(undefined, clearProjectSortingFilteringAndTask({ projectId: "p1" }))
        expect(p.projectsSortingAndFilter["p1"].filters.length).toBe(0)
        expect(p.projectsSortingAndFilter["p1"].sort.length).toBe(0)
    })
})
