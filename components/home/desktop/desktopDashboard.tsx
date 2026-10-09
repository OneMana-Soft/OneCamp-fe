"use client"

import { homeGreeting } from "@/lib/utils/homeGreeting"
import { useDispatch, useSelector } from "react-redux"
import { RootState } from "@/store/store"
import Link from "next/link"
import {
    ArrowRight,
    CheckSquare,
    Clock,
    FileText,
    Folder,
    Hash,
    LayoutTemplate,
    Lock,
    MessageCircle,
    Users,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { formatDistanceToNow } from "date-fns"
import { openUI } from "@/store/slice/uiSlice"
import { ListRow } from "@/components/ui/listRow"
import { PageContainer } from "@/components/ui/pageContainer"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import SetupChecklist from "@/components/home/SetupChecklist"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { GlanceLine, todayEyebrow } from "@/components/home/GlanceLine"
import { PageHeader } from "@/components/ui/pageHeader"

function SectionHeader({
    title,
    actionLabel,
    href,
}: {
    title: string
    actionLabel?: string
    href?: string
}) {
    return (
        <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-medium text-muted-foreground">
                {title}
            </h2>
            {actionLabel && href && (
                <Link
                    href={href}
                    scroll={false}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    {actionLabel}
                    <ArrowRight className="h-3 w-3" />
                </Link>
            )}
        </div>
    )
}

const TYPE_ICON: Record<string, React.ElementType> = {
    task: CheckSquare,
    channel: Hash,
    doc: FileText,
    project: Folder,
    team: Users,
    chat: MessageCircle,
    user: Users,
}

export function DesktopDashboard() {
    const dispatch = useDispatch()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
        GetEndpointUrl.SelfProfile,
    )
    const userSidebar = useSelector((state: RootState) => state.users.userSidebar)
    // Already fetched and deduped by the layout; this mount is a cache read,
    // not a second request.
    const isAdmin = useSidenav().data?.data?.user_is_admin
    const recentItems = useSelector((state: RootState) => state.recentItems.items)
    const rightPanelState = useSelector(
        (state: RootState) => state.rightPanel.rightPanelState,
    )
    const greetingLine = homeGreeting(
        new Date().getHours(),
        selfProfile.data?.data?.user_full_name,
        selfProfile.data?.data?.user_name,
    )
    const totalDMUnread = (userSidebar.userChats || []).reduce(
        (acc, chat) => acc + (chat.dm_unread || 0),
        0,
    )
    const unreadChannels = (userSidebar.userChannels || []).filter(
        (c) => (c.unread_post_count || 0) > 0,
    ).length
    const incompleteTasks =
        selfProfile.data?.data?.user_incomplete_task_count ?? 0
    const overdueTasks = selfProfile.data?.data?.user_overdue_task_count || 0


    return (
        <PageContainer className="overflow-y-auto py-8" bounded={false}>
            <div className="max-w-5xl mx-auto flex flex-col gap-8">
                {/* Welcome */}
                <PageHeader eyebrow={todayEyebrow()} title={greetingLine} size="lg">
                    <GlanceLine
                        items={[
                            { count: unreadChannels, one: "unread channel", many: "unread channels", href: "/app/channel" },
                            { count: totalDMUnread, one: "unread message", many: "unread messages", href: "/app/chat" },
                            { count: userSidebar.totalUnreadActivityCount || 0, one: "notification", many: "notifications", href: "/app/activity" },
                            {
                                count: incompleteTasks,
                                one: "open task",
                                many: "open tasks",
                                href: "/app/myTask",
                                flag: overdueTasks > 0 ? `${overdueTasks} overdue` : undefined,
                            },
                        ]}
                    />
                </PageHeader>

                {/* Setup, while there is any left. Self-hides when the workspace
                    is actually configured, not when somebody ticks a box. */}
                <SetupChecklist isAdmin={isAdmin} />

                {/* In no channel at all: where the team talks, and the way in. */}
                <NoChannelsYet />

                {/* Two-column body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left — Recent + Channels */}
                    <div className="lg:col-span-2 flex flex-col gap-8">
                        <div>
                            <SectionHeader
                                title="Recent"
                                actionLabel="See all"
                                href="/app/search"
                            />
                            {recentItems.length > 0 ? (
                                <div className="-mx-2">
                                    {recentItems.slice(0, 8).map((item) => {
                                        const Icon = TYPE_ICON[item.type] || Clock
                                        return (
                                            <Link
                                                key={`${item.type}-${item.id}`}
                                                href={item.path}
                                                scroll={false}
                                                className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                            >
                                                <ListRow
                                                    density="default"
                                                    leading={<Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
                                                    title={item.title}
                                                    meta={formatDistanceToNow(item.timestamp, { addSuffix: true })}
                                                    className="rounded-md border-0 px-2 hover:bg-foreground/[0.04]"
                                                />
                                            </Link>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="py-2">
                                    {/* "No recent activity yet" sat directly
                                            under the morning's activity, so the
                                            page contradicted itself on a first
                                            visit. This list is what YOU opened,
                                            not what happened, and saying so is
                                            both true and the thing that stops it
                                            reading as a broken feed. */}
                                    <p className="text-sm text-muted-foreground">
                                            Nothing opened yet. Channels, docs and tasks you visit appear here.
                                        </p>
                                </div>
                            )}
                        </div>

                        {userSidebar.userChannels && userSidebar.userChannels.length > 0 && (
                            <div>
                                <SectionHeader
                                    title="Your channels"
                                    actionLabel="Browse"
                                    href="/app/channel"
                                />
                                <div className="-mx-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                                    {userSidebar.userChannels.slice(0, 6).map((channel) => {
                                        const unread = channel.unread_post_count > 0
                                        const ChannelIcon = channel.ch_private ? Lock : Hash
                                        return (
                                            <Link
                                                key={channel.ch_uuid}
                                                href={`/app/channel/${channel.ch_uuid}`}
                                                scroll={false}
                                                className={cn(
                                                    "flex items-center gap-2.5 rounded-md px-2 py-2",
                                                    "transition-colors duration-100 hover:bg-foreground/[0.04]",
                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                                )}
                                            >
                                                <ChannelIcon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                                                {/* Unread is weight and a count, not a tinted tile:
                                                    the page has one accent and it marks what is new. */}
                                                <div className="min-w-0 flex-1">
                                                    <span className={cn("block truncate text-sm", unread ? "font-semibold text-foreground" : "text-foreground/90")}>
                                                        {channel.ch_name}
                                                    </span>
                                                    {/* The sidebar payload carries no member count, so a
                                                        count here read "0 members" on every channel. */}
                                                    {channel.ch_about && (
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {channel.ch_about}
                                                        </span>
                                                    )}
                                                </div>
                                                {channel.ch_call_active && (
                                                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                                                        Live
                                                    </span>
                                                )}
                                                {unread && (
                                                    <span className="shrink-0 font-mono text-xs tabular-nums text-primary">
                                                        {channel.unread_post_count > 99 ? "99+" : channel.unread_post_count}
                                                    </span>
                                                )}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right — Quick actions + Teams */}
                    <div className="flex flex-col gap-8">
                        <div>
                            <SectionHeader title="Quick actions" />
                            <div className="-mx-2 space-y-0.5">
                                <QuickAction icon={FileText} label="New document" onClick={() => dispatch(openUI({ key: 'createDoc' }))} />
                                <QuickAction icon={CheckSquare} label="New task" onClick={() => dispatch(openUI({ key: 'createTask' }))} />
                                {/* A whole plan in one click: the fastest way to see a project at work. */}
                                <QuickAction icon={LayoutTemplate} label="Project from a template" onClick={() => dispatch(openUI({ key: 'createProject', data: { templateId: "client-project" } }))} />
                            </div>
                        </div>

                        {userSidebar.userTeams && userSidebar.userTeams.length > 0 && (
                            <div>
                                <SectionHeader
                                    title="Your teams"
                                    actionLabel="View all"
                                    href="/app/team"
                                />
                                <div className="space-y-px">
                                    {userSidebar.userTeams.slice(0, 5).map((team) => (
                                        <Link
                                            key={team.team_uuid}
                                            href={`/app/team/${team.team_uuid}`}
                                            scroll={false}
                                            className={cn(
                                                "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                                                "transition-colors duration-100",
                                                "hover:bg-foreground/[0.04]",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            )}
                                        >
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                                                <span className="text-2xs font-semibold text-muted-foreground">
                                                    {team.team_name?.charAt(0)?.toUpperCase() || "T"}
                                                </span>
                                            </div>
                                            <span className="truncate text-sm text-foreground">
                                                {team.team_name}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    )
}

// One row of the home screen's quick actions.
function QuickAction({ icon: Icon, label, onClick, active = false }: { icon: typeof FileText; label: string; onClick: () => void; active?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full text-left group flex items-center gap-3 rounded-md px-2 py-2 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                active ? "bg-brand-muted" : "hover:bg-foreground/[0.04]",
            )}
        >
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground" strokeWidth={1.75} />
            <span className="text-sm font-medium">{label}</span>
            {active && <span className="ml-auto text-2xs font-medium text-primary">Open</span>}
        </button>
    )
}
