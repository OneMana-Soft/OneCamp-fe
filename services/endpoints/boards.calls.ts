// The boards area's calls slice (miro-27): the calls that showed a board, read as its Call button opens
// (components/board/boardCall). A slice of its own (services/endpoints/<area>.<slice>.ts, V-305): BoardsGet loads with
// the board's first screen, and this route only with the button's chunk.
export enum BoardCallsGet {
  GetBoardCalls = "/board/getBoardCalls",
}
