"use client"

import { useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { useFetch } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
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
import { MobileHomeSearchBar } from "@/components/home/mobile/mobileHomeSearchBar"
import { cn } from "@/lib/utils/helpers/cn"
import { formatDistanceToNow } from "date-fns"
import { categoryColors, CategoryKey, getCategoryColor } from "@/lib/colors"
import { useTouchFlash } from "@/hooks/useTouchFlash"
import { ListRow } from "@/components/ui/listRow"

/**
 * Tappable surface (button) with built-in CSS press-flash. No ripple.
 * Used by quick action tiles and stat cards on mobile home.
 */
function TapSurface({
    onClick,
    className,
    children,
    ariaLabel,
}: {
    onClick: () => void
    className?: string
    children: React.ReactNode
    ariaLabel?: string
}) {
    const { pressed, bind } = useTouchFlash()
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            data-pressed={pressed || undefined}
            {...bind}
            className={cn(
                "text-left transition-colors duration-150 ease-out",
                "active:bg-accent data-[pressed=true]:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                className,
            )}
        >
            {children}
        </button>
    )
}

function QuickActionTile({
    icon: Icon,
    label,
    category,
    onClick,
}: {
    icon: React.ElementType
    label: string
    category: CategoryKey
    onClick: () => void
}) {
    const colors = categoryColors[category]
    return (
        <TapSurface
            ariaLabel={label}
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl",
                "border border-border/50 bg-card/40 p-3 aspect-square",
            )}
        >
            <div
                className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    colors.bg,
                )}
            >
                <Icon className={cn("h-5 w-5", colors.text)} />
            </div>
            <span className="text-xs font-medium text-foreground">{label}</span>
        </TapSurface>
    )
}

function StatTile({
    icon: Icon,
    label,
    value,
    category,
    onClick,
    badge,
}: {
    icon: React.ElementType
    label: string
    value: number | string
    category: CategoryKey
    onClick: () => void
    badge?: { label: string; tone: "destructive" | "muted" }
}) {
    const colors = categoryColors[category]
    return (
        <TapSurface
            ariaLabel={label}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-xl p-3.5",
                "border border-border/50 bg-card/40",
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
                    <span className="text-base font-semibold tabular-nums leading-none">
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
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                    {label}
                </div>
            </div>
        </TapSurface>
    )
}

function SectionHeader({
    title,
    actionLabel,
    onAction,
}: {
    title: string
    actionLabel?: string
    onAction?: () => void
}) {
    return (
        <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </h2>
            {actionLabel && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    {actionLabel}
                    <ArrowRight className="h-3 w-3" />
                </button>
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

export function MobileHome() {
    const router = useRouter()
    const userSidebar = useSelector((state: RootState) => state.users.userSidebar)
    const recentItems = useSelector((state: RootState) => state.recentItems.items)
    const selfProfile = useFetch<UserProfileInterface>(
        GetEndpointUrl.SelfProfileSideNav,
        undefined,
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const userName = selfProfile.data?.data?.user_name || "there"
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

    return (
        <div className="flex flex-col gap-6 p-4">
            {/* Header */}
            <div className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {greeting}, {userName}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Here&apos;s what&apos;s happening
                </p>
            </div>

            {/* Search */}
            <MobileHomeSearchBar />

            {/* AI briefing — self-hides when AI/memory is off or empty */}
            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-2.5">
                <QuickActionTile
                    icon={MessageCircle}
                    label="DMs"
                    category="chat"
                    onClick={() => router.push("/app/chat")}
                />
                <QuickActionTile
                    icon={Hash}
                    label="Channels"
                    category="channel"
                    onClick={() => router.push("/app/channel")}
                />
                <QuickActionTile
                    icon={FileText}
                    label="Docs"
                    category="doc"
                    onClick={() => router.push("/app/doc")}
                />
                <QuickActionTile
                    icon={CheckSquare}
                    label="Tasks"
                    category="task"
                    onClick={() => router.push("/app/myTask")}
                />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
                <StatTile
                    icon={MessageCircle}
                    label="Unread DMs"
                    value={totalDMUnread}
                    category="chat"
                    onClick={() => router.push("/app/chat")}
                />
                <StatTile
                    icon={Bell}
                    label="Notifications"
                    value={userSidebar.totalUnreadActivityCount || 0}
                    category="notification"
                    onClick={() => router.push("/app/activity")}
                />
                <StatTile
                    icon={Hash}
                    label="Unread channels"
                    value={unreadChannels}
                    category="channel"
                    onClick={() => router.push("/app/channel")}
                />
                <StatTile
                    icon={CheckSquare}
                    label="Incomplete tasks"
                    value={incompleteTasks}
                    category="task"
                    onClick={() => router.push("/app/myTask")}
                    badge={
                        overdueTasks > 0
                            ? { label: `${overdueTasks} overdue`, tone: "destructive" }
                            : undefined
                    }
                />
            </div>

            {/* Recent */}
            {recentItems.length > 0 && (
                <div>
                    <SectionHeader title="Recent" />
                    <div className="space-y-px">
                        {recentItems.slice(0, 5).map((item) => {
                            const Icon = TYPE_ICON[item.type] || Clock
                            const colors = getCategoryColor(item.type)
                            return (
                                <ListRow
                                    key={`${item.type}-${item.id}`}
                                    density="default"
                                    onClick={() => router.push(item.path)}
                                    leading={
                                        <div
                                            className={cn(
                                                "flex h-8 w-8 items-center justify-center rounded-md",
                                                colors.bg,
                                            )}
                                        >
                                            <Icon className={cn("h-4 w-4", colors.text)} />
                                        </div>
                                    }
                                    title={item.title}
                                    subtitle={formatDistanceToNow(item.timestamp)}
                                />
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Channels */}
            {userSidebar.userChannels && userSidebar.userChannels.length > 0 && (
                <div>
                    <SectionHeader
                        title="Channels"
                        actionLabel="See all"
                        onAction={() => router.push("/app/channel")}
                    />
                    <div className="space-y-px">
                        {userSidebar.userChannels.slice(0, 5).map((channel) => (
                            <ListRow
                                key={channel.ch_uuid}
                                density="default"
                                onClick={() =>
                                    router.push(`/app/channel/${channel.ch_uuid}`)
                                }
                                leading={
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
                                        <Hash className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                }
                                title={channel.ch_name}
                                subtitle={
                                    channel.unread_post_count > 0
                                        ? `${channel.unread_post_count} unread`
                                        : undefined
                                }
                                emphasize={channel.unread_post_count > 0}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* AI CTA */}
            <TapSurface
                ariaLabel="Open AI Assistant"
                onClick={() => router.push("/app/ai")}
                className={cn(
                    "flex items-center gap-3 rounded-xl border p-3.5",
                    "border-violet-500/20 bg-violet-500/5",
                )}
            >
                <div
                    className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        categoryColors.ai.bg,
                    )}
                >
                    <Sparkles className={cn("h-5 w-5", categoryColors.ai.text)} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                        AI Assistant
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                        Ask questions, summarize docs, and more
                    </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </TapSurface>
        </div>
    )
}
