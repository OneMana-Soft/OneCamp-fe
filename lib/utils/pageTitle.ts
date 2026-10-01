/**
 * The browser tab's title for an app page: "(3) #design · OneCamp".
 *
 * Every page used to be titled "OneCamp", so with a channel, a doc and a DM
 * open there was no telling the tabs apart, and nothing in the tab said that
 * something was waiting (Vercel's interface guidelines: keep <title> accurate
 * to the current context). Names come from what the sidebar already holds; a
 * page whose name is not known yet falls back to its section.
 */
export interface TitleLookups {
  channels?: Record<string, string>
  projects?: Record<string, string>
  teams?: Record<string, string>
  docs?: Record<string, string>
  boards?: Record<string, string>
  people?: Record<string, string>
}

const SECTIONS: Record<string, string> = {
  home: "Home",
  channel: "Channels",
  chat: "DMs",
  inbox: "Inbox",
  myTask: "My Tasks",
  task: "Task",
  activity: "Activity",
  later: "Later",
  doc: "Docs",
  board: "Boards",
  project: "Project",
  team: "Team",
  calendar: "Calendar",
  tables: "Tables",
  templates: "Templates",
  search: "Search",
  ai: "OneCamp AI",
  settings: "Settings",
  user: "Profile",
}

export function pageTitle(pathname: string, lookups: TitleLookups = {}, unread = 0): string {
  const seg = (pathname || "").split(/[?#]/)[0].split("/").filter(Boolean)
  // seg[0] is "app"; seg[1] the section; seg[2] an id, or "group" for a group DM.
  const section = seg[1] || ""
  const id = seg[2] || ""
  let label = SECTIONS[section] || ""
  if (id) {
    const named: Record<string, string | undefined> = {
      channel: lookups.channels?.[id] && `#${lookups.channels[id]}`,
      project: lookups.projects?.[id],
      team: lookups.teams?.[id],
      doc: lookups.docs?.[id],
      board: lookups.boards?.[id],
      chat: id === "group" ? "Group chat" : lookups.people?.[id],
      user: lookups.people?.[id],
    }
    label = named[section]?.trim() || label
  }
  const count = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : ""
  return `${count}${label ? `${label} · ` : ""}OneCamp`
}
