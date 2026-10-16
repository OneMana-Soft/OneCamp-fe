/**
 * The app's top-level places: the first segment after /app of every route
 * folder (app/app/<segment>). A guard (appSegments.test.ts) keeps this list
 * equal to the folders, so a route added there is added here.
 *
 * What it is for: telling a real place from an address no route answers.
 * The phone's bars switch on the first segment; an unknown one (a 404) drew
 * an empty top bar, no title and no way back, under a tab bar that marked
 * More as the current place.
 */
export const APP_SEGMENTS = [
  "admin",
  "board",
  "calendar",
  "channel",
  "chat",
  "create",
  "doc",
  "forward",
  "goals",
  "home",
  "inbox",
  "later",
  "mail",
  "meet",
  "myTask",
  "posts",
  "profile",
  "project",
  "recordings",
  "search",
  "settings",
  "tables",
  "task",
  "team",
  "templates",
  "user",
] as const

/** Whether a path is in one of the app's places. "/app/q4-thing" is not. Pure. */
export function isAppPlace(pathname: string | null | undefined): boolean {
  const seg = (pathname || "").split(/[?#]/)[0].replace(/^\/+/, "").split("/")
  return seg[0] === "app" && (APP_SEGMENTS as readonly string[]).includes(seg[1] ?? "")
}
