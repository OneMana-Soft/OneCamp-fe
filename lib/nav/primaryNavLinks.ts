import {
    Bell as BellIcon,
    Calendar,
    CircleCheck,
    Hash,
    Home,
    MessageCircle,
    Shield,
    Sparkles,
    Table as TableIcon,
} from "@/lib/icons"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import {
    app_admin,
    app_calendar_path,
    app_channel_path,
    app_chat_path,
    app_doc_activity,
    app_home_path,
    app_my_task_path,
    app_tables_path,
    app_templates_path,
} from "@/types/paths"
import { DesktopNavType } from "@/types/nav"

/**
 * The app-level destinations in the desktop rail, in order.
 *
 * A pure function rather than an inline array so the information
 * architecture can be asserted in a test without mounting the sidebar,
 * which needs Redux, SWR and the router to say anything at all. Focus
 * mode partitions this list (see focusMode.ts), so the two have to be
 * checkable against each other.
 */

export interface NavUnreadCounts {
    channel: number
    dm: number
    activity: number
}

/**
 * True when the given path sits under /app/<segment>. `path` is a split
 * pathname, so index 2 is the first segment below /app.
 */
export function isNavSectionActive(path: readonly string[], segment: string): boolean {
    return path.length > 2 && path[2] === segment
}

function variantFor(path: readonly string[], segment: string): DesktopNavType["variant"] {
    return isNavSectionActive(path, segment) ? "sidebarActive" : "ghost"
}

export function buildPrimaryNavLinks(
    path: readonly string[],
    counts: NavUnreadCounts,
    isAdmin: boolean,
): DesktopNavType[] {
    const links: DesktopNavType[] = [
        {
            title: "Home",
            label: "",
            icon: Home,
            variant: variantFor(path, "home"),
            path: app_home_path,
        },
        {
            title: "Channels",
            label: formatCount(counts.channel),
            icon: Hash,
            variant: variantFor(path, "channel"),
            path: app_channel_path,
        },
        {
            title: "DMs",
            label: formatCount(counts.dm),
            icon: MessageCircle,
            variant: variantFor(path, "chat"),
            path: app_chat_path,
        },
        {
            title: "My Tasks",
            label: "",
            icon: CircleCheck,
            variant: variantFor(path, "myTask"),
            path: app_my_task_path,
        },
        {
            title: "Calendar",
            label: "",
            icon: Calendar,
            variant: variantFor(path, "calendar"),
            path: app_calendar_path,
        },
        {
            title: "Tables",
            label: "",
            icon: TableIcon,
            variant: variantFor(path, "tables"),
            path: app_tables_path,
        },
        {
            title: "Templates",
            label: "",
            icon: Sparkles,
            variant: variantFor(path, "templates"),
            path: app_templates_path,
        },
        {
            title: "Activity",
            label: formatCount(counts.activity),
            icon: BellIcon,
            variant: variantFor(path, "activity"),
            path: app_doc_activity,
        },
    ]

    if (isAdmin) {
        links.push({
            title: "Admin",
            label: "",
            icon: Shield,
            variant: variantFor(path, "admin"),
            path: app_admin,
        })
    }

    return links
}
