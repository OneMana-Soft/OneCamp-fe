"use client"

import { homeGreeting } from "@/lib/utils/homeGreeting"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import SetupChecklist from "@/components/home/SetupChecklist"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { useFetch } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import {
    ArrowRight,
    CheckSquare,
    Clock,
    FileText,
    Folder,
    Hash,
    MessageCircle,
    Users,
} from "@/lib/icons"
import { MobileHomeSearchBar } from "@/components/home/mobile/mobileHomeSearchBar"
import { cn } from "@/lib/utils/helpers/cn"
import { formatDistanceToNow } from "date-fns"
import { GlanceLine, todayEyebrow } from "@/components/home/GlanceLine"
import { PageHeader } from "@/components/ui/pageHeader"
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
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
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
    onClick,
}: {
    icon: React.ElementType
    label: string
    onClick: () => void
}) {
    return (
        <TapSurface
            ariaLabel={label}
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg py-2.5"
        >
            <Icon className="h-5 w-5 text-foreground/80" strokeWidth={1.75} />
            <span className="text-xs text-muted-foreground">{label}</span>
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
            <h2 className="text-xs font-medium text-muted-foreground">
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

    // Already fetched and deduped by the layout; a cache read, as on desktop.
    const isAdmin = useSidenav().data?.data?.user_is_admin
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
        <div className="flex flex-col gap-6 p-4">
            <PageHeader eyebrow={todayEyebrow()} title={greetingLine}>
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

            {/* Search */}
            <MobileHomeSearchBar />

            {/* Setup, while there is any left, as on desktop. A new owner often
                opens the "your workspace is ready" email on a phone, and this
                is the only screen that tells them what to do next. */}
            <SetupChecklist isAdmin={isAdmin} />

            {/* In no channel at all: where the team talks, and the way in. */}
            <NoChannelsYet />

            {/* Quick Actions */}
            <div className="-mx-1 grid grid-cols-4 gap-1">
                <QuickActionTile
                    icon={MessageCircle}
                    label="DMs"
                    onClick={() => router.push("/app/chat")}
                />
                <QuickActionTile
                    icon={Hash}
                    label="Channels"
                    onClick={() => router.push("/app/channel")}
                />
                <QuickActionTile
                    icon={FileText}
                    label="Docs"
                    onClick={() => router.push("/app/doc")}
                />
                <QuickActionTile
                    icon={CheckSquare}
                    label="Tasks"
                    onClick={() => router.push("/app/myTask")}
                />
            </div>

            {/* Recent */}
            {recentItems.length > 0 && (
                <div>
                    <SectionHeader title="Recent" />
                    <div className="space-y-px">
                        {recentItems.slice(0, 5).map((item) => {
                            const Icon = TYPE_ICON[item.type] || Clock
                            return (
                                <ListRow
                                    key={`${item.type}-${item.id}`}
                                    density="default"
                                    onClick={() => router.push(item.path)}
                                    leading={<Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
                                    title={item.title}
                                    subtitle={formatDistanceToNow(item.timestamp, { addSuffix: true })}
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
                                leading={<Hash className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
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
        </div>
    )
}
