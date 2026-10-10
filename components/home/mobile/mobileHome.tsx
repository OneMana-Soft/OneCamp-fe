"use client"

import { homeGreeting } from "@/lib/utils/homeGreeting"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import SetupChecklist, { adminFromSidenav } from "@/components/home/SetupChecklist"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import {
    ArrowRight,
    CheckSquare,
    Clock,
    FileText,
    Folder,
    Hash,
    Lock,
    MessageCircle,
    Users,
} from "@/lib/icons"
import { MobileHomeSearchBar } from "@/components/home/mobile/mobileHomeSearchBar"
import { cn } from "@/lib/utils/helpers/cn"
import { GlanceLine, glanceLoading, todayEyebrow } from "@/components/home/GlanceLine"
import { HomeRow } from "@/components/home/HomeRow"
import { GreetingBand } from "@/components/home/GreetingBand"
import { hueFor } from "@/lib/campHue"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import type { CampHue } from "@/lib/campHue"
import { relativeTime } from "@/lib/utils/relativeTime"
import { PageHeader } from "@/components/ui/pageHeader"
import { useTouchFlash } from "@/hooks/useTouchFlash"
import { destinationHue } from "@/lib/destinationHue"
import { homeInset } from "@/components/home/homeLines"

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
    hue,
    onClick,
}: {
    icon: React.ElementType
    label: string
    /** The place's hue (lib/destinationHue): a fixed hue per place, what it
        is, not who. The icon sits on a tile in it. */
    hue: CampHue
    onClick: () => void
}) {
    return (
        <TapSurface
            ariaLabel={label}
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg py-2.5"
        >
            <Tile hue={hue} size="lg">
                <Icon strokeWidth={1.75} />
            </Tile>
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
        <div className={cn("mb-1 flex h-8 items-center justify-between", homeInset)}>
            <h2 className="text-xs font-medium text-muted-foreground">
                {title}
            </h2>
            {actionLabel && onAction && (
                // A finger's 44px, drawn in the header's 32px: the negative
                // margins keep the row's height.
                <button
                    type="button"
                    onClick={onAction}
                    className="-my-1.5 -mr-2 flex h-11 items-center gap-0.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                    {actionLabel}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
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
    // Already fetched and deduped by the layout; a cache read, as on desktop.
    const sidenav = useSidenav()
    const self = sidenav.data?.data
    const isAdmin = adminFromSidenav(sidenav)
    const greetingLine = homeGreeting(
        new Date().getHours(),
        self?.user_full_name,
        self?.user_name,
    )
    const totalDMUnread = (userSidebar.userChats || []).reduce(
        (acc, chat) => acc + (chat.dm_unread || 0),
        0,
    )
    const unreadChannels = (userSidebar.userChannels || []).filter(
        (c) => (c.unread_post_count || 0) > 0,
    ).length
    const incompleteTasks = self?.user_incomplete_task_count ?? 0
    const overdueTasks = self?.user_overdue_task_count || 0

    return (
        <div className="flex flex-col gap-6 p-4">
            {/* The band, the search, the cards and the lists share one left
                and one right edge: the band used to reach 4px past them. */}
            <GreetingBand hues={(userSidebar.userChannels || []).slice(0, 5).map((c) => hueFor(c.ch_uuid))}>
            <PageHeader eyebrow={todayEyebrow()} title={greetingLine} phoneTitle>
                <GlanceLine
                    loading={glanceLoading(self, userSidebar)}
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
            </GreetingBand>

            {/* Search */}
            <MobileHomeSearchBar />

            {/* Setup, while there is any left, as on desktop. A new owner often
                opens the "your workspace is ready" email on a phone, and this
                is the only screen that tells them what to do next. */}
            <SetupChecklist isAdmin={isAdmin} />

            {/* In no channel at all: where the team talks, and the way in. */}
            <NoChannelsYet />

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-1">
                <QuickActionTile
                    icon={MessageCircle}
                    label="DMs"
                    hue={destinationHue("/app/chat")}
                    onClick={() => router.push("/app/chat")}
                />
                <QuickActionTile
                    icon={Hash}
                    label="Channels"
                    hue={destinationHue("/app/channel")}
                    onClick={() => router.push("/app/channel")}
                />
                <QuickActionTile
                    icon={FileText}
                    label="Docs"
                    hue={destinationHue("/app/doc")}
                    onClick={() => router.push("/app/doc")}
                />
                <QuickActionTile
                    icon={CheckSquare}
                    label="Tasks"
                    hue={destinationHue("/app/myTask")}
                    onClick={() => router.push("/app/myTask")}
                />
            </div>

            {/* Recent: one line a row, the time at the right, at a finger's height. */}
            {recentItems.length > 0 && (
                <section aria-label="Recent">
                    <SectionHeader title="Recent" />
                    <div className="grid">
                        {recentItems.slice(0, 5).map((item) => {
                            const Icon = TYPE_ICON[item.type] || Clock
                            return (
                                <HomeRow
                                    key={`${item.type}-${item.id}`}
                                    touch
                                    href={item.path}
                                    icon={
                                        item.type === "user"
                                            ? <IdentityMark variant="avatar" size={24} id={item.id} label={item.title} />
                                            : <IdentityMark variant="tile" size={24} id={item.id} icon={<Icon strokeWidth={1.75} />} />
                                    }
                                    label={item.title}
                                    meta={relativeTime(new Date(item.timestamp).toISOString())}
                                />
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Channels */}
            {userSidebar.userChannels && userSidebar.userChannels.length > 0 && (
                <section aria-label="Channels">
                    <SectionHeader
                        title="Channels"
                        actionLabel="See all"
                        onAction={() => router.push("/app/channel")}
                    />
                    <div className="grid">
                        {userSidebar.userChannels.slice(0, 5).map((channel) => {
                            const unread = channel.unread_post_count > 0
                            const ChannelIcon = channel.ch_private ? Lock : Hash
                            return (
                                <HomeRow
                                    key={channel.ch_uuid}
                                    touch
                                    href={`/app/channel/${channel.ch_uuid}`}
                                    icon={<IdentityMark variant="tile" size={24} id={channel.ch_uuid} icon={<ChannelIcon strokeWidth={1.75} />} />}
                                    label={channel.ch_name}
                                    emphasize={unread}
                                    meta={unread ? (
                                        <span className="font-mono text-primary">
                                            {channel.unread_post_count > 99 ? "99+" : channel.unread_post_count}
                                        </span>
                                    ) : undefined}
                                />
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}
