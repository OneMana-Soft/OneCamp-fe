import {
    BarChart3,
    Bookmark,
    Calendar,
    CircleCheck,
    Clapperboard,
    FileText,
    Home,
    Inbox as InboxIcon,
    LayoutDashboard,
    LayoutTemplate,
    Mail,
    Table as TableIcon,
    Target,
    Users,
    Gauge,
} from "@/lib/icons"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import {
    app_board_path,
    app_calendar_path,
    app_doc_path,
    app_home_path,
    app_inbox_path,
    app_later_path,
    app_mail_path,
    app_my_task_path,
    app_recording_activity,
    app_tables_path,
    app_team_path,
    app_templates_path,
} from "@/types/paths"
import { DesktopNavType } from "@/types/nav"

/**
 * The app-level destinations in the desktop sidebar, in order (design v3,
 * shell S5).
 *
 * Four rows people live in (Home, Inbox, My tasks, Later), then everything
 * that has a page but isn't daily, behind the More popover (FOLDED_NAV_TITLES
 * in focusMode.ts names them). Channels and DMs are no longer rows: they are
 * sections below already, and their pages stay at G C, G M and ⌘K. Admin
 * moved to the workspace menu.
 *
 * A pure function rather than an inline array so the information
 * architecture can be asserted in a test without mounting the sidebar.
 */

export interface NavUnreadCounts {
    channel: number
    dm: number
    /** Notifications that have no row of their own: mentions, replies, assignments. */
    activity: number
    /** Saved-for-later items whose reminder has come. */
    laterDue?: number
    /** Open tasks of yours that are due. */
    tasksDue?: number
    /** OneCamp AI nudges marked urgent (0 where AI is off). */
    urgentNudges?: number
}

/**
 * True when the given path sits under /app/<segment>. `path` is a split
 * pathname, so index 2 is the first segment below /app.
 */
function isNavSectionActive(path: readonly string[], segment: string): boolean {
    return path.length > 2 && path[2] === segment
}

function variantFor(path: readonly string[], segment: string): DesktopNavType["variant"] {
    return isNavSectionActive(path, segment) ? "sidebarActive" : "ghost"
}

/** The Inbox row's number: what has no row of its own, plus urgent nudges. DMs badge their own rows. Pure. */
export function inboxBadgeCount(counts: Pick<NavUnreadCounts, "activity" | "urgentNudges">): number {
    return Math.max(0, counts.activity || 0) + Math.max(0, counts.urgentNudges || 0)
}

export function buildPrimaryNavLinks(
    path: readonly string[],
    counts: NavUnreadCounts,
    // Kept for the callers: Admin lives in the workspace menu now, for admins only.
    _isAdmin?: boolean,
): DesktopNavType[] {
    void _isAdmin
    const view = (segment: string, path_: string): DesktopNavType["variant"] =>
        variantFor(path, segment) === "sidebarActive" && path_ !== "" ? "sidebarActive" : "ghost"

    return [
        { title: "Home", label: "", icon: Home, variant: variantFor(path, "home"), path: app_home_path },
        {
            // Notifications and nudges (design v3, N1): the page that was Activity.
            title: "Inbox",
            label: formatCount(inboxBadgeCount(counts)),
            icon: InboxIcon,
            variant: variantFor(path, "inbox"),
            path: app_inbox_path,
        },
        {
            title: "My tasks",
            label: formatCount(counts.tasksDue ?? 0),
            icon: CircleCheck,
            variant: variantFor(path, "myTask"),
            path: app_my_task_path,
        },
        {
            title: "Later",
            label: formatCount(counts.laterDue ?? 0),
            icon: Bookmark,
            variant: variantFor(path, "later"),
            path: app_later_path,
        },
        // Behind More: a page each, not daily.
        { title: "Calendar", label: "", icon: Calendar, variant: variantFor(path, "calendar"), path: app_calendar_path },
        { title: "Tables", label: "", icon: TableIcon, variant: variantFor(path, "tables"), path: app_tables_path },
        { title: "Templates", label: "", icon: LayoutTemplate, variant: variantFor(path, "templates"), path: app_templates_path },
        { title: "Docs", label: "", icon: FileText, variant: view("doc", app_doc_path), path: app_doc_path },
        { title: "Boards", label: "", icon: LayoutDashboard, variant: view("board", app_board_path), path: app_board_path },
        // The person's own Gmail, which was "Inbox" before v3.
        { title: "Mail", label: "", icon: Mail, variant: variantFor(path, "mail"), path: app_mail_path },
        { title: "Goals", label: "", icon: Target, variant: variantFor(path, "goals"), path: "/app/goals" },
        { title: "Reports", label: "", icon: BarChart3, variant: "ghost", path: "/app/project?view=reports" },
        { title: "Workload", label: "", icon: Gauge, variant: "ghost", path: "/app/project?view=workload" },
        { title: "Recordings", label: "", icon: Clapperboard, variant: variantFor(path, "recordings"), path: app_recording_activity },
        { title: "Teams", label: "", icon: Users, variant: variantFor(path, "team"), path: app_team_path },
    ]
}
