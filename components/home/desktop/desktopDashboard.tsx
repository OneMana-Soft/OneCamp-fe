"use client"

import { useDispatch, useSelector } from "react-redux"
import { RootState } from "@/store/store"
import Link from "next/link"
import {
    ArrowRight,
    Bell,
    CheckSquare,
    Clock,
    FileText,
    Folder,
    Hash,
    MessageCircle,
    Sparkles,
    Users,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { formatDistanceToNow } from "date-fns"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { openUI } from "@/store/slice/uiSlice"
import { categoryColors, CategoryKey, getCategoryColor } from "@/lib/colors"
import { ListRow } from "@/components/ui/listRow"
import { PageContainer } from "@/components/ui/pageContainer"

function StatCard({
    icon: Icon,
    label,
    value,
    href,
    badge,
    category,
}: {
    icon: React.ElementType
    label: string
    value: number | string
    href: string
    badge?: { label: string; tone: "destructive" | "muted" }
    category: CategoryKey
}) {
    const colors = categoryColors[category]
    return (
        <Link
            href={href}
            scroll={false}
            className={cn(
                "group flex items-center gap-3 rounded-xl border border-border/50 bg-card/40",
                "px-4 py-3.5 transition-colors duration-150",
                "hover:bg-accent/40 hover:border-border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
        >
            <div
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    colors.bg,
                )}
            >
                <Icon className={cn("h-5 w-5", colors.text)} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-lg font-semibold tabular-nums leading-none">
                        {value}
                    </span>
                    {badge && (
                        <span
                            className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                badge.tone === "destructive"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground",
                            )}
                        >
                            {badge.label}
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                    {label}
                </div>
            </div>
        </Link>
    )
}

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
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
    const recentItems = useSelector((state: RootState) => state.recentItems.items)
    const rightPanelState = useSelector(
        (state: RootState) => state.rightPanel.rightPanelState,
    )
    const isAiOpen = rightPanelState.isOpen && rightPanelState.data.aiChatOpen

    const userName = selfProfile.data?.data?.user_full_name || "there"
    const totalDMUnread = (userSidebar.userChats || []).reduce(
        (acc, chat) => acc + (chat.dm_unread || 0),
        0,
    )
    const unreadChannels = (userSidebar.userChannels || []).filter(
        (c) => (c.unread_post_count || 0) > 0,
    ).length
    const incompleteTasks =
        selfProfile.data?.data?.user_incomplete_task_count ??
        selfProfile.data?.data?.user_task_count ??
        0
    const overdueTasks = selfProfile.data?.data?.user_overdue_task_count || 0

    const greeting = (() => {
        const hour = new Date().getHours()
        if (hour < 12) return "Good morning"
        if (hour < 18) return "Good afternoon"
        return "Good evening"
    })()

    const handleAiToggle = () => {
        if (isAiOpen) dispatch(closeRightPanel())
        else dispatch(openRightPanel({ aiChatOpen: true }))
    }

    return (
        <PageContainer className="overflow-y-auto py-8" bounded={false}>
            <div className="max-w-5xl mx-auto flex flex-col gap-8">
                {/* Welcome */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {greeting}, {userName}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Here&apos;s what&apos;s happening in your workspace
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                        icon={MessageCircle}
                        label="Unread DMs"
                        value={totalDMUnread}
                        category="chat"
                        href="/app/chat"
                    />
                    <StatCard
                        icon={Bell}
                        label="Notifications"
                        value={userSidebar.totalUnreadActivityCount || 0}
                        category="notification"
                        href="/app/activity"
                    />
                    <StatCard
                        icon={Hash}
                        label="Unread channels"
                        value={unreadChannels}
                        category="channel"
                        href="/app/channel"
                    />
                    <StatCard
                        icon={CheckSquare}
                        label="Incomplete tasks"
                        value={incompleteTasks}
                        category="task"
                        badge={
                            overdueTasks > 0
                                ? { label: `${overdueTasks} overdue`, tone: "destructive" }
                                : undefined
                        }
                        href="/app/myTask"
                    />
                </div>

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
                                <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
                                    {recentItems.slice(0, 8).map((item) => {
                                        const Icon = TYPE_ICON[item.type] || Clock
                                        const colors = getCategoryColor(item.type)
                                        return (
                                            <Link
                                                key={`${item.type}-${item.id}`}
                                                href={item.path}
                                                scroll={false}
                                                className="block focus:outline-none [&:not(:last-child)]:border-b border-border/40"
                                            >
                                                <ListRow
                                                    density="default"
                                                    leading={
                                                        <div
                                                            className={cn(
                                                                "flex h-7 w-7 items-center justify-center rounded-md",
                                                                colors.bg,
                                                            )}
                                                        >
                                                            <Icon
                                                                className={cn(
                                                                    "h-3.5 w-3.5",
                                                                    colors.text,
                                                                )}
                                                            />
                                                        </div>
                                                    }
                                                    title={item.title}
                                                    meta={formatDistanceToNow(item.timestamp)}
                                                    className="rounded-none border-0 hover:bg-accent/40"
                                                />
                                            </Link>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/50 bg-card/30 p-10 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                            <Clock className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            No recent activity yet
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {userSidebar.userChannels && userSidebar.userChannels.length > 0 && (
                            <div>
                                <SectionHeader
                                    title="Your Channels"
                                    actionLabel="Browse"
                                    href="/app/channel"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {userSidebar.userChannels.slice(0, 6).map((channel) => (
                                        <Link
                                            key={channel.ch_uuid}
                                            href={`/app/channel/${channel.ch_uuid}`}
                                            scroll={false}
                                            className={cn(
                                                "flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5",
                                                "transition-colors duration-150",
                                                "hover:bg-accent/40 hover:border-border",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            )}
                                        >
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
                                                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-foreground">
                                                    {channel.ch_name}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    {channel.ch_about || "No description"}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right — Quick actions + Teams */}
                    <div className="flex flex-col gap-8">
                        <div>
                            <SectionHeader title="Quick actions" />
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => dispatch(openUI({ key: 'createDoc' }))}
                                    className="w-full text-left group flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 transition-colors hover:bg-accent/40 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                    <div
                                        className={cn(
                                            "flex h-7 w-7 items-center justify-center rounded-md",
                                            categoryColors.doc.bg,
                                        )}
                                    >
                                        <FileText
                                            className={cn(
                                                "h-3.5 w-3.5",
                                                categoryColors.doc.text,
                                            )}
                                        />
                                    </div>
                                    <span className="text-sm font-medium">New document</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dispatch(openUI({ key: 'createTask' }))}
                                    className="w-full text-left group flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 transition-colors hover:bg-accent/40 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                    <div
                                        className={cn(
                                            "flex h-7 w-7 items-center justify-center rounded-md",
                                            categoryColors.task.bg,
                                        )}
                                    >
                                        <CheckSquare
                                            className={cn(
                                                "h-3.5 w-3.5",
                                                categoryColors.task.text,
                                            )}
                                        />
                                    </div>
                                    <span className="text-sm font-medium">New task</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAiToggle}
                                    className={cn(
                                        "w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                        isAiOpen
                                            ? "border-violet-500/30 bg-violet-500/10"
                                            : "border-border/50 bg-card/30 hover:bg-accent/40 hover:border-border",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "flex h-7 w-7 items-center justify-center rounded-md",
                                            categoryColors.ai.bg,
                                        )}
                                    >
                                        <Sparkles
                                            className={cn(
                                                "h-3.5 w-3.5",
                                                categoryColors.ai.text,
                                            )}
                                        />
                                    </div>
                                    <span className="text-sm font-medium">AI assistant</span>
                                    {isAiOpen && (
                                        <span className="ml-auto text-[10px] font-medium text-violet-600 dark:text-violet-400">
                                            Open
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {userSidebar.userTeams && userSidebar.userTeams.length > 0 && (
                            <div>
                                <SectionHeader
                                    title="Your Teams"
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
                                                "hover:bg-accent/40",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            )}
                                        >
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                                                <span className="text-[10px] font-semibold text-muted-foreground">
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
