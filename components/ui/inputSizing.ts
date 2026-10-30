// A height the caller wrote with no breakpoint: h-8, h-10, h-[30px], !h-8.
const OWN_HEIGHT = /(?:^|\s)!?h-[^\s:]+(?=\s|$)/

/**
 * A field's height, given the caller's classes (kept apart from Input so a
 * field that only needs the height doesn't bring the Input in).
 *
 * - None of its own: 44px on a phone and under a finger at any width, a
 *   phone held sideways or a tablet (pointer-coarse: the pointer decides, as
 *   for tooltips, not the width); 32px from md up with a mouse (design v3's
 *   field, the md button's height).
 * - One the caller writes (h-8) holds from md up with a mouse; below md, and
 *   under a finger, a standalone field keeps 44px. tailwind-merge alone kept
 *   md:h-9 over it, so 87 fields drew 36px on every computer.
 * - `dense` (a table cell, an inline editor, a picker's input): the caller's
 *   height at every width, or 32px.
 */
export function inputSizing(className: string | undefined, dense: boolean | undefined) {
  const own = OWN_HEIGHT.test(className ?? "")
  if (dense) return own ? "" : "h-8"
  return own ? "max-md:h-11 pointer-coarse:h-11" : "h-11 md:h-8 pointer-coarse:h-11"
}
