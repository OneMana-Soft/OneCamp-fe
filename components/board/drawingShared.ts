// The drawing's (boardExcalidraw's) modules a canvas's parent may hold too, held by both canvases (boardCanvas,
// GuestBoardViewer) for the drawing's chunk shape (V-1167, boardPiecesChunk.test.ts "are cut once"). A lazy chunk's
// group is what its target reaches beyond what the parent already holds: when the board page held lib/board/ids.ts,
// a call's stage did not hold viewport.ts and a guest's viewer did not hold excalidrawPart.ts, the drawing was cut
// once per such set and every board library in it (layers, mind maps, cards, code blocks...) shipped once per cut.
// With both canvases holding these, every parent holds the same part of the drawing, and it is cut once.
import "@/components/board/excalidrawPart"
import "@/lib/board/ids"
import "@/lib/board/viewport"
