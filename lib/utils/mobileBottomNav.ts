// Which surfaces own the bottom edge of a phone screen.
//
// One list, read by both sides of the same decision: the bottom navigation
// hides itself on these pages, and the layout drops the padding it keeps for
// that navigation. The two used to decide separately, the padding was removed
// on task pages only, and every other page here (channels, chats, docs,
// boards, tables) kept 64px of blank where the hidden bar would have been.
//
// Naming the surfaces that need the edge inverts the default: a page added
// later keeps its navigation unless somebody decides otherwise, because a
// redundant bar is a smaller failure than a page with no way out.
const BOTTOM_OWNED_BY_PAGE = [
  /^\/app\/channel\/[^/]+/, // message composer
  /^\/app\/chat\/[^/]+/, // message composer, DM and group
  /^\/app\/doc\/[^/]+/, // editor toolbar
  /^\/app\/board\/[^/]+/, // canvas
  /^\/app\/task\/[^/]+/, // detail view with its own action row
  /^\/app\/tables\/[^/]+/, // grid that scrolls both ways
  /^\/app\/calendar\/event\//, // detail view
  /^\/app\/meet\//, // a call owns the whole screen
  /^\/app\/create\//, // form with a submit bar
  /^\/app\/forward\//, // send bar
]

export function pageOwnsBottomEdge(pathname: string): boolean {
  return BOTTOM_OWNED_BY_PAGE.some((r) => r.test(pathname))
}
