/**
 * The browser tab's title for an app page: "(3) #design · OneCamp".
 *
 * Every page used to be titled "OneCamp", so with a channel, a doc and a DM
 * open there was no telling the tabs apart, and nothing in the tab said that
 * something was waiting (Vercel's interface guidelines: keep <title> accurate
 * to the current context). Names come from what the sidebar already holds; a
 * page whose name is not known yet falls back to its section.
 */
import { placeForLocation } from "@/lib/adminSections"

export interface TitleLookups {
  channels?: Record<string, string>
  projects?: Record<string, string>
  teams?: Record<string, string>
  docs?: Record<string, string>
  boards?: Record<string, string>
  people?: Record<string, string>
  /** The name the page gave itself (lib/utils/pageName): a task, a goal. */
  own?: string
}

const SECTIONS: Record<string, string> = {
  home: "Home",
  channel: "Channels",
  chat: "DMs",
  inbox: "Inbox",
  mail: "Mail",
  myTask: "My tasks",
  task: "Task",
  later: "Later",
  doc: "Docs",
  board: "Boards",
  project: "Project",
  team: "Team",
  calendar: "Calendar",
  goals: "Goals",
  tables: "Tables",
  templates: "Templates",
  search: "Search",
  ai: "OneCamp AI",
  settings: "Settings",
  admin: "Admin",
  user: "Profile",
  profile: "Profile",
  recordings: "Recordings",
  posts: "Your posts",
  meet: "Meeting",
}

/** What the page is beyond its address: an admin page's ?tab=, or a name it gives itself (the 404). */
export interface TitleWhere {
  tab?: string | null
  label?: string | null
}

export function pageTitle(pathname: string, lookups: TitleLookups = {}, unread = 0, where: TitleWhere = {}): string {
  const path = (pathname || "").split(/[?#]/)[0]
  const seg = path.split("/").filter(Boolean)
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
    label = lookups.own?.trim() || named[section]?.trim() || label
  }
  // Each settings and admin section by its own name (QA SH-11): every one
  // was "Settings", and every admin page "OneCamp".
  if (section === "settings" || section === "admin") {
    const place = placeForLocation(path, where.tab ?? null)
    if (place) label = `${place.label} · Settings`
  }
  if (where.label?.trim()) label = where.label.trim()
  const count = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : ""
  return `${count}${label ? `${label} · ` : ""}OneCamp`
}
