import { PictureInPicture2 } from "lucide-react"

/**
 * Picture-in-picture's glyph (meet-14): on the dock's control that opens the
 * window, and on the window's way back to the call. It comes straight from
 * lucide-react, under main's ruling of 31 Oct 17:1x (the one exception to the
 * registry this lane holds, counted by components/ui/iconImports.test.ts).
 * Both ways round the registry moved every app route: a new @/lib/icons export
 * re-cut the shared first-load chunks (+348 B), and so did a glyph other
 * screens already draw (ExternalLink, Maximize2: +280 B on 64 routes,
 * release-1011/logs/calls-97/NOTES.md). A glyph only the call draws stays in
 * the call's own chunk.
 */
export const PipGlyph = PictureInPicture2
