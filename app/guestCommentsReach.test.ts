import { describe, expect, it } from "vitest"

import { chainOf, sourceOf, walk } from "../scripts/fluidity/reach.mjs"

// A board link's guest comments through the link (miro-33): the guest's
// comments piece (components/guest/guestBoardComments) shows the board's own
// comments (components/board/boardComments) with the link's ask. The members'
// writes (usePost, the endpoints table, the mirror and the people search) come
// from the board page, which passes them in, so the guest's piece never carries
// them: one BoardComments, and the guest downloads none of the members' code.
// This walks the piece's static imports and fails, naming the chain, if it
// reaches the members' writes again.
const PIECE = "components/guest/guestBoardComments.tsx"
const MEMBERS = (f: string) => f === "hooks/usePost.ts" || f === "hooks/usePost.tsx" || f.startsWith("services/endpoints/") || f.startsWith("components/board/boardCommentWrites.")

function membersReach(entries: string[]): string[] {
  const { files } = walk(entries) as { files: Map<string, string | null> }
  return [...files.keys()].filter(MEMBERS).map((f) => `${f}: ${chainOf(files, f)}`)
}

describe("a board link's guest comments without the members' code", () => {
  it("is never a static import of the guest's comments piece", () => {
    expect(membersReach([PIECE])).toEqual([])
  })

  it("would see one: the board page, walked from, brings the members' writes", () => {
    expect(membersReach(["app/app/board/[board-id]/page.tsx"]).length).toBeGreaterThan(0)
  })
})

// The guest's comments open no chunk group of their own round the app's shell
// (WZ39K trace, 16 Nov): a new lazy group holding the drawer and the board's
// chrome gave four of the /app layout's shell modules (moreMarks, sheetPanels,
// ChevronLeft, Ellipsis) a group more, and Turbopack cut the layout into one
// chunk more on all 70 /app routes. So the piece, loaded by the link's page
// alone, reaches neither the board's title chrome (components/board/boardChrome:
// its clusters come from components/board/chromeCluster) nor, with the thread
// it opens, the drawer: a phone's sheet comes through the shared sheet's chunk
// (components/ui/responsive-sheet), which holds the drawer already.
const DRAWER = "components/ui/drawer.tsx"
const TITLE_CHROME = "components/board/boardChrome.tsx"
const reaches = (entry: string, file: string) => (walk([entry]) as { files: Map<string, string | null> }).files.has(file)
const loadsPiece = (file: string) => /import\(\s*["']@\/components\/guest\/guestBoardComments["']\s*\)/.test(sourceOf(file) as string)

describe("a board link's guest comments in no chunk group of their own round the shell", () => {
  it("loads the piece from the link's page alone", () => {
    expect(loadsPiece("components/guest/GuestBoardLink.tsx")).toBe(true)
    expect(loadsPiece("components/guest/GuestBoardViewer.tsx")).toBe(false)
    expect(loadsPiece("components/guest/guestReact.tsx")).toBe(false)
  })

  it("reaches no title chrome from the piece", () => {
    expect(reaches(PIECE, TITLE_CHROME)).toBe(false)
  })

  it("reaches no drawer from the piece or from the thread it opens", () => {
    expect(reaches(PIECE, DRAWER)).toBe(false)
    expect(reaches("components/board/boardCommentThread.tsx", DRAWER)).toBe(false)
  })

  it("would see them: the board page, walked from, brings the drawer and the title chrome", () => {
    expect(reaches("app/app/board/[board-id]/page.tsx", DRAWER)).toBe(true)
    expect(reaches("app/app/board/[board-id]/page.tsx", TITLE_CHROME)).toBe(true)
  })
})
