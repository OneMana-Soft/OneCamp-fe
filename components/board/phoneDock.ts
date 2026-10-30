/**
 * Where the board's bars dock on a phone, from the bottom: the facilitation
 * bar (boardFacilitation) just above the canvas's footer and the board's own
 * buttons, and a selection's bar (the notes bar, a frame's bar) one bar above
 * it, so neither covers the other. Each bar is h-11 (2.75rem), with 0.5rem
 * between. An editor always has the facilitation bar, and only an editor
 * gets a selection's bar. Each bar at the foot is marked data-phone-foot: the
 * board page publishes the highest one's top, and the app's toasts and notices
 * sit above it (app/phone.css C9).
 */
export const PHONE_DOCK = {
  facilitation: "bottom-[8.5rem]",
  selection: "bottom-[11.75rem]",
} as const
