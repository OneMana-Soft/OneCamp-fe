import { describe, expect, it } from "vitest"
import type { BoardInfoInterface } from "@/types/board"
import { boardRoles } from "./boardRoles"

// What a board offers its reader (miro-32), as getBoardInfo answers it: the
// owner is its maker alone (deleting it is theirs); whoever may edit draws;
// a commenter the server names comments and draws nothing. The server checks
// every one of them.

const OWNER = "u-owner"
const info = (over: Partial<BoardInfoInterface & { board_can_comment: boolean; board_can_manage: boolean }> = {}) =>
  ({ board_uuid: "b1", board_title: "Launch", board_created_by: { user_uuid: OWNER }, board_edit_access: 0, board_read_access: 1, board_comment_access: 0, ...over }) as BoardInfoInterface

describe("a board's roles, as its reader sees them", () => {
  it("makes its maker the owner, who edits and comments", () => {
    expect(boardRoles(info(), OWNER)).toEqual({ owner: true, edit: true, comment: true })
  })
  it("never makes a co-owner the owner: deleting the board stays its maker's", () => {
    expect(boardRoles(info({ board_edit_access: 1, board_can_manage: true, board_can_comment: true }), "u-ann")).toEqual({ owner: false, edit: true, comment: true })
  })
  it("lets a commenter comment and nothing else", () => {
    expect(boardRoles(info({ board_comment_access: 1, board_can_comment: true }), "u-cal")).toEqual({ owner: false, edit: false, comment: true })
  })
  it("leaves a viewer reading", () => {
    expect(boardRoles(info(), "u-di")).toEqual({ owner: false, edit: false, comment: false })
  })
  it("offers nothing before the board and the reader are known", () => {
    expect(boardRoles(undefined, OWNER)).toEqual({ owner: false, edit: false, comment: false })
    expect(boardRoles(info({ board_edit_access: 1, board_can_comment: true }), undefined)).toEqual({ owner: false, edit: false, comment: false })
  })
})
