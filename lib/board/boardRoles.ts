import type { BoardInfoInterface } from "@/types/board"

/** What a board offers its reader (miro-32): its maker owns it (and alone deletes it); editors draw; editors and commenters comment. The server checks each. */
export function boardRoles(info: (BoardInfoInterface & { board_can_comment?: boolean }) | undefined, me?: string) {
  const owner = !!me && info?.board_created_by?.user_uuid === me
  const edit = owner || (!!me && (info?.board_edit_access ?? 0) > 0)
  return { owner, edit, comment: edit || (!!me && !!info?.board_can_comment) }
}
