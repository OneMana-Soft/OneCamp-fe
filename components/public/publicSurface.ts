/**
 * Every page OneCamp shows to people outside the workspace, as the credit
 * names it in ?ref=made-with-<surface> (components/public/MadeWithOneCamp).
 * A type alone, imported as one: the credit is drawn under every route (the
 * root not-found shows it), and a type ships nothing, so a new surface adds no
 * byte to any route's code (app/firstLoad.test.ts walks no type import).
 */
export type PublicSurface = "booking" | "booked" | "form" | "invitation" | "guest-channel" | "guest-project" | "guest-doc" | "guest-board" | "board-embed" | "guest-table" | "guest-meeting" | "published-page" | "not-found"
