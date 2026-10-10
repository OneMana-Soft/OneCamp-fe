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
    Sparkles,
    Users,
} from "@/lib/icons"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { openUI } from "@/store/slice/uiSlice"
import { PageContainer } from "@/components/ui/pageContainer"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import SetupChecklist, { adminFromSidenav } from "@/components/home/SetupChecklist"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { GlanceLine, glanceLoading, todayEyebrow } from "@/components/home/GlanceLine"
import { HomeRow } from "@/components/home/HomeRow"
import { GreetingBand } from "@/components/home/GreetingBand"
import { hueFor } from "@/lib/campHue"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { relativeTime } from "@/lib/utils/relativeTime"
import { PageHeader } from "@/components/ui/pageHeader"
import BriefingCard from "@/components/ai/BriefingCard"
import AttentionCard from "@/components/ai/AttentionCard"
import WhileYouWereAwayCard from "@/components/ai/WhileYouWereAwayCard"
import { AgentWorkCard } from "@/components/ai/AgentWorkCard"
import { homeInset } from "@/components/home/homeLines"
import { cn } from "@/lib/utils/helpers/cn"

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
        <div className={cn("mb-1.5 flex h-6 items-center justify-between", homeInset)}>
            <h2 className="text-xs font-medium text-muted-foreground">
                {title}
            </h2>
            {actionLabel && href && (
                <Link
                    href={href}
                    scroll={false}
                    className="flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                    {actionLabel}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
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
    const sidenav = useSidenav()
    const isAdmin = adminFromSidenav(sidenav)
    const recentItems = useSelector((state: RootState) => state.recentItems.items)
    const rightPanelState = useSelector(
        (state: RootState) => state.rightPanel.rightPanelState,
    )
    const isAiOpen = rightPanelState.isOpen && rightPanelState.data.aiChatOpen

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

    const handleAiToggle = () => {
        if (isAiOpen) dispatch(closeRightPanel())
        else dispatch(openRightPanel({ aiChatOpen: true }))
    }

    return (
        <PageContainer className="overflow-y-auto py-8" bounded={false}>
            <div className="max-w-5xl mx-auto flex flex-col gap-8">
                {/* Welcome, on the screen's one band */}
                <GreetingBand hues={(userSidebar.userChannels || []).slice(0, 5).map((c) => hueFor(c.ch_uuid))}>
                <PageHeader eyebrow={todayEyebrow()} title={greetingLine} size="lg" phoneTitle>
                    <GlanceLine
                        loading={glanceLoading(sidenav.data?.data, userSidebar)}
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

                {/* Setup, while there is any left. Self-hides when the workspace
                    is actually configured, not when somebody ticks a box. */}
                <SetupChecklist isAdmin={isAdmin} />

                {/* In no channel at all: where the team talks, and the way in. */}
                <NoChannelsYet />

                {/* What needs me now: the cross-surface action queue, the one
                    answer Home exists to give. It holds its place while it loads. */}
                <AttentionCard />

                {/* "What did I miss": free at rest (counts come from the sidebar
                    already in the store); spends one LLM call only when asked. */}
                <WhileYouWereAwayCard />

                {/* Two-column body. Every list is one line a row at one height. */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Recent and channels */}
                    <div className="lg:col-span-2 flex flex-col gap-8">
                        <section aria-label="Recent">
                            <SectionHeader
                                title="Recent"
                                actionLabel="See all"
                                href="/app/search"
                            />
                            {recentItems.length > 0 ? (
                                <div className="grid">
                                    {recentItems.slice(0, 8).map((item) => {
                                        const Icon = TYPE_ICON[item.type] || Clock
                                        return (
                                            <HomeRow
                                                key={`${item.type}-${item.id}`}
                                                href={item.path}
                                                // In its own hue: a channel or project is the
                                                // same colour here as in search and the palette.
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
                            ) : (
                                // This list is what YOU opened, not what happened:
                                // saying so is true, and it stops the empty list
                                // reading as a broken feed under a busy briefing.
                                <p className={cn("py-2 text-sm text-muted-foreground", homeInset)}>
                                    Nothing opened yet. Channels, docs and tasks you visit appear here.
                                </p>
                            )}
                        </section>

                        {userSidebar.userChannels && userSidebar.userChannels.length > 0 && (
                            <section aria-label="Your channels">
                                <SectionHeader
                                    title="Your channels"
                                    actionLabel="Browse"
                                    href="/app/channel"
                                />
                                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                                    {userSidebar.userChannels.slice(0, 6).map((channel) => {
                                        const unread = channel.unread_post_count > 0
                                        const ChannelIcon = channel.ch_private ? Lock : Hash
                                        return (
                                            <HomeRow
                                                key={channel.ch_uuid}
                                                href={`/app/channel/${channel.ch_uuid}`}
                                                icon={<IdentityMark variant="tile" size={24} id={channel.ch_uuid} icon={<ChannelIcon strokeWidth={1.75} />} />}
                                                label={channel.ch_name}
                                                emphasize={unread}
                                                meta={
                                                    channel.ch_call_active ? (
                                                        <span className="flex items-center gap-1 font-medium text-success-ink">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
                                                            Live
                                                        </span>
                                                    ) : unread ? (
                                                        // Unread is weight and a count, not a tinted tile:
                                                        // the page has one accent and it marks what is new.
                                                        <span className="font-mono text-primary">
                                                            {channel.unread_post_count > 99 ? "99+" : channel.unread_post_count}
                                                        </span>
                                                    ) : undefined
                                                }
                                            />
                                        )
                                    })}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right: quick actions and teams */}
                    <div className="flex flex-col gap-8">
                        <section aria-label="Quick actions">
                            <SectionHeader title="Quick actions" />
                            <div className="grid">
                                {/* Each action in a fixed hue: what it makes, not who it is. */}
                                <HomeRow icon={<Tile hue="sky" size="sm"><FileText strokeWidth={1.75} /></Tile>} label="New document" onClick={() => dispatch(openUI({ key: 'createDoc' }))} />
                                <HomeRow icon={<Tile hue="moss" size="sm"><CheckSquare strokeWidth={1.75} /></Tile>} label="New task" onClick={() => dispatch(openUI({ key: 'createTask' }))} />
                                {/* A whole plan in one click: the fastest way to see a project at work. */}
                                <HomeRow icon={<Tile hue="sun" size="sm"><LayoutTemplate strokeWidth={1.75} /></Tile>} label="Project from a template" onClick={() => dispatch(openUI({ key: 'createProject', data: { templateId: "client-project" } }))} />
                                <HomeRow
                                    icon={<Tile hue="dusk" size="sm"><Sparkles strokeWidth={1.75} /></Tile>}
                                    label="AI assistant"
                                    onClick={handleAiToggle}
                                    active={isAiOpen}
                                    meta={isAiOpen ? "Open" : undefined}
                                />
                            </div>
                        </section>

                        {userSidebar.userTeams && userSidebar.userTeams.length > 0 && (
                            <section aria-label="Your teams">
                                <SectionHeader
                                    title="Your teams"
                                    actionLabel="View all"
                                    href="/app/team"
                                />
                                <div className="grid">
                                    {userSidebar.userTeams.slice(0, 5).map((team) => (
                                        <HomeRow
                                            key={team.team_uuid}
                                            href={`/app/team/${team.team_uuid}`}
                                            icon={<IdentityMark variant="tile" size={24} id={team.team_uuid} label={team.team_name || "Team"} />}
                                            label={team.team_name}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                </div>

                {/* Reading, last: what the agents did and the AI briefing. Both
                    arrive after the page, with heights nobody can predict; above
                    the lists they pushed the page down when they came. */}
                <AgentWorkCard />
                <BriefingCard />
            </div>
        </PageContainer>
    )
}
