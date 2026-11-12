import { describe, expect, it } from "vitest"

import { boardFilterParams, boardsHref, emptyCopy, isFiltered, NO_FILTER, readBoardFilter, unavailableLine } from "./boardListFilter"

const P = "b0a4d000-0000-4000-8000-0000000046c1"
const T = "b0a4d000-0000-4000-8000-0000000046d1"
const read = (q: string) => readBoardFilter(new URLSearchParams(q))

describe("the boards list's filters in its address (miro-46 3)", () => {
  it("reads whose boards, and a project or a team", () => {
    expect(read("")).toEqual(NO_FILTER)
    expect(read("owner=mine")).toEqual({ owner: "mine", project: null, team: null })
    expect(read(`owner=shared&project=${P}`)).toEqual({ owner: "shared", project: P, team: null })
    expect(read(`team=${T}`)).toEqual({ owner: null, project: null, team: T })
  })

  it("never holds a project and a team at once: the project, the narrower, stands", () => {
    expect(read(`project=${P}&team=${T}`)).toEqual({ owner: null, project: P, team: null })
    expect(boardFilterParams({ owner: null, project: P, team: T })).toBe(`project=${P}`)
  })

  it("drops what it doesn't know: another owner, an id that isn't one", () => {
    expect(read("owner=everyone&project=launch&team=1")).toEqual(NO_FILTER)
    expect(read(`owner=Mine&team=${T}x`)).toEqual(NO_FILTER)
  })

  it("writes the filter back, keeping the address's other parameters, and none for no filter", () => {
    expect(boardFilterParams({ owner: "mine", project: null, team: T })).toBe(`owner=mine&team=${T}`)
    expect(boardsHref(NO_FILTER)).toBe("/app/board")
    expect(boardsHref({ owner: null, project: P, team: null })).toBe(`/app/board?project=${P}`)
    expect(boardsHref({ owner: "shared", project: null, team: null }, `owner=mine&project=${P}&from=home`)).toBe("/app/board?from=home&owner=shared")
    expect(read(boardsHref({ owner: "mine", project: P, team: null }).split("?")[1])).toEqual({ owner: "mine", project: P, team: null })
    expect(isFiltered(NO_FILTER)).toBe(false)
    expect(isFiltered({ ...NO_FILTER, team: T })).toBe(true)
  })
})

describe("what an empty filtered list says", () => {
  it("says each filter's own empty, and how to link a board to a project", () => {
    expect(emptyCopy({ ...NO_FILTER, owner: "mine" }).title).toBe("No boards of yours yet.")
    expect(emptyCopy({ ...NO_FILTER, owner: "shared" }).title).toBe("Nothing shared with you yet.")
    const project = emptyCopy({ ...NO_FILTER, project: P }, "Website relaunch")
    expect(project.title).toBe("No boards linked to Website relaunch yet.")
    // The project's own words: its Attachments tab, and the button there (components/entityLink/EntityLinkPicker).
    expect(project.description).toBe("To link one, open the project's Attachments tab and choose Link a doc or board.")
    const team = emptyCopy({ ...NO_FILTER, team: T }, "Design")
    expect(team.title).toBe("No boards linked to Design's projects yet.")
    expect(team.description).toBe("To link one, open a project's Attachments tab and choose Link a doc or board.")
    expect(emptyCopy({ owner: "mine", project: P, team: null }, "Website relaunch").title).toBe("None of your boards are linked to Website relaunch yet.")
    expect(emptyCopy({ owner: "shared", project: null, team: T }).title).toBe("Nothing shared with you is linked to this team's projects yet.")
  })

  it("names what it let go when the server won't show it", () => {
    expect(unavailableLine({ ...NO_FILTER, project: P })).toBe("That project isn't available.")
    expect(unavailableLine({ ...NO_FILTER, team: T })).toBe("That team isn't available.")
  })
})
