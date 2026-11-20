import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The board's pieces' loaders, held by both canvases (V-1083, boardPiecesChunk.test.ts).
export const CodeBlockView = lazyPiece(() => import("./boardCodeBlock").then((m) => ({ default: m.BoardCodeBlock })))
