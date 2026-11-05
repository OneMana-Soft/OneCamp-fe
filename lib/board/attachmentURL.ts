import { BoardsGet } from "@/services/endpoints/boards"

// A member's picture: the board's route checks access and redirects to the stored object (the board's page, a doc's whiteboard).
export function boardAttachmentURL(boardId: string, objectUuid: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
  return `${baseUrl}${BoardsGet.GetBoardAttachment}/${boardId}/${objectUuid}`
}
