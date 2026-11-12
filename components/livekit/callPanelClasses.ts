// The classes the call's side panels share, in a module of their own. The call
// draws the AI's panel with itself, and the others are lazy chunks: through
// this file both reach them without the call importing the panels' module
// (sidePanel), which would move it out of their chunks and re-cut the lazy
// groups, and without adding to callSurface, which the first-load stage reads.

/** A side panel's foot (Chat's, Q&A's and the AI's composers): its last line clear of a phone's home indicator. */
export const CALL_PANEL_FOOT = "shrink-0 border-t border-white/[0.06] px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]"
