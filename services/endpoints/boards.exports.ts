// The boards area's exports slice: what a board's lazy export trail tells the
// admin log (components/board/exportRecord). A slice of its own
// (services/endpoints/<area>.<slice>.ts, V-305): BoardsPost loads with the
// board's first screen, and this route only with Excalidraw.
export enum BoardExportRoutes {
  RecordBoardExport = "/board/recordExport",
}
