import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { readSidebarSections } from "@/lib/nav/sidebarDisclosure"

// UX-PROJECTS-H1 (PROJECTS-36): a board shows every open status (Backlog, To
// do, In progress, In review) and Done; Cancelled stays hidden. A task moved
// to In review left the board, since In review was hidden by default and the
// choice was one for every board. Now each board keeps its own, as its
// grouping and its folded columns are kept: a project's, or My tasks'.

const SECTIONS = "onecamp-sidebar-sections"

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.cookie = `${SECTIONS}=; path=/; max-age=0`
})

const columns = (scope: string) => renderHook(() => useBoardColumns(scope))

describe("a board's columns", () => {
  it("show every open status and Done at first, and hide Cancelled", () => {
    const { result } = columns("p1")
    const [shown] = result.current
    for (const c of ["backlog", "todo", "inProgress", "inReview", "done"]) expect(isShown(shown, c)).toBe(true)
    expect(isShown(shown, "canceled")).toBe(false)
    // A project's own status is shown until it's hidden.
    expect(isShown(shown, "c-qa")).toBe(true)
  })

  it("are each board's own: hiding one in a project leaves another project and My tasks alone", () => {
    const one = columns("p1")
    act(() => one.result.current[1]("inReview", false))
    expect(isShown(one.result.current[0], "inReview")).toBe(false)
    expect(isShown(columns("p2").result.current[0], "inReview")).toBe(true)
    expect(isShown(columns("mine").result.current[0], "inReview")).toBe(true)
  })

  it("are kept for the board across a reload", () => {
    const first = columns("p1")
    act(() => first.result.current[1]("canceled", true))
    first.unmount()
    expect(isShown(columns("p1").result.current[0], "canceled")).toBe(true)
  })

  it("leave behind a choice once made for every board: an old hidden In review is what lost cards", () => {
    document.cookie = `${SECTIONS}=${encodeURIComponent(JSON.stringify({ "board-column:inReview": false, "board-column:backlog": false }))}; path=/`
    const [shown] = columns("p1").result.current
    expect(isShown(shown, "inReview")).toBe(true)
    expect(isShown(shown, "backlog")).toBe(true)
  })

  it("take the old choices out of the sidebar's cookie, and leave its sections", () => {
    // The cookie goes with every request: a choice no board reads is dead weight.
    document.cookie = `${SECTIONS}=${encodeURIComponent(JSON.stringify({ "board-column:inReview": false, "board-column:c-qa": true, "projects": true }))}; path=/`
    columns("p1")
    expect(readSidebarSections()).toEqual({ projects: true })
  })
})
