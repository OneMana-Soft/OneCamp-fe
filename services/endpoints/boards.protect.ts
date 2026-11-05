// The boards area's protect slice (miro-44): a board's owner or a workspace admin protects objects or lifts their
// protection (components/board/protectedLayer). A slice of its own (services/endpoints/<area>.<slice>.ts, V-305):
// BoardsPost loads with the board's first screen, and this route only with the board's tools.
export enum BoardProtectRoutes {
  Protect = "/board/protect",
}
