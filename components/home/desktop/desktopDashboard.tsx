"use client"

/**
 * Home on a desktop (design v3, hub.md H1): where you see the day and finish
 * things in it.
 *
 *   1. the greeting and its composition;
 *   2. for an admin, the setup checklist;
 *   3. the two answers side by side: what needs me now, and today;
 *   4. agents at work, only while a job runs;
 *   5. projects;
 *   6. jump back in, and create;
 *   7. the briefing, last, so arriving late it pushes nothing.
 *
 * A 944px column, flat on the sheet: only what you can pick up is a card.
 * Your channels and Your teams are gone; the sidebar has them. The page comes
 * up once per session (rise) and is still after that.
 */
import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useDispatch, useSelector } from "react-redux"

import { homeGreeting } from "@/lib/utils/homeGreeting"
import { RootState } from "@/store/store"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { adminFromSidenav, ChecklistPlace } from "@/components/home/setupChecklistPlace"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { GlanceLine, todayEyebrow } from "@/components/home/GlanceLine"
import { Greeting } from "@/components/home/Greeting"
import { NeedsMe } from "@/components/home/NeedsMe"
import { JumpBackIn, CreateTiles } from "@/components/home/HomeLists"
import { useHomeNeeds } from "@/components/home/useHomeNeeds"
import { useTodayEvents } from "@/components/home/useTodayEvents"
import { clockTime } from "@/lib/utils/date/clock"
import { needsCounts } from "@/components/home/needsMe"
import { HubSectionHeader } from "@/components/ui/hubRow"
import { riseProps, useRiseOnce } from "@/lib/hub/motion"
import { cn } from "@/lib/utils/helpers/cn"
import BriefingCard from "@/components/ai/BriefingCard"
import AttentionCard from "@/components/ai/AttentionCard"
import WhileYouWereAwayCard from "@/components/ai/WhileYouWereAwayCard"
import { AgentWorkCard } from "@/components/ai/AgentWorkCard"

// The setup checklist, a chunk of its own: only an admin with steps left sees
// it. Its place is held while it comes (setupChecklistPlace).
const SetupChecklist = dynamic(() => import("@/components/home/SetupChecklist"), { ssr: false, loading: ChecklistPlace })

// The agenda and the projects load on their own (app/firstLoad.test.ts), each
// holding its section's height so nothing moves when it lands.
const TodayAgenda = dynamic(() => import("@/components/home/TodayAgenda"), {
    ssr: false,
    loading: () => <SectionSkeleton title="Today" rows={1} card />,
})
const ProjectsStrip = dynamic(() => import("@/components/home/ProjectsStrip"), {
    ssr: false,
    loading: () => <SectionSkeleton title="Projects" rows={1} />,
})

function SectionSkeleton({ title, rows, card = false }: { title: string; rows: number; card?: boolean }) {
    return (
        <section aria-busy="true">
            <HubSectionHeader title={title} />
            <div className={cn(card && "overflow-hidden rounded-lg bg-sheet shadow-e1 dark:bg-[#18191C]")}>
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className={cn("animate-shimmer bg-press", card ? "h-[52px] border-b border-line bg-transparent" : "h-14 rounded-lg")} />
                ))}
            </div>
        </section>
    )
}

/**
 * True from the frame after Home first paints. What sits under the fold (the
 * agents' strip, Jump back in, Create, the briefing) mounts then, so the first
 * commit is only the greeting, the guide and the two answers: with all of it in
 * one commit the greeting reached the page about 170ms later at 4x CPU than
 * before v3 (scripts/fluidity, Home's largest contentful paint).
 */
function useAfterFirstPaint(): boolean {
    const [ready, setReady] = useState(false)
    useEffect(() => {
        let t = 0
        const raf = requestAnimationFrame(() => {
            t = window.setTimeout(() => setReady(true), 0)
        })
        return () => {
            cancelAnimationFrame(raf)
            window.clearTimeout(t)
        }
    }, [])
    return ready
}

export function DesktopDashboard() {
    const dispatch = useDispatch()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const userSidebar = useSelector((state: RootState) => state.users.userSidebar)
    const pending = useSelector((state: RootState) => state.pendingAction.actions)
    // Already fetched and deduped by the layout; this mount is a cache read,
    // not a second request.
    const sidenav = useSidenav()
    const isAdmin = adminFromSidenav(sidenav)
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState)
    const isAiOpen = rightPanelState.isOpen && rightPanelState.data.aiChatOpen
    const aiAvailable = useAIAvailable()
    const rise = useRiseOnce("/app/home")
    const below = useAfterFirstPaint()
    const r = (i: number) => riseProps(rise, i)

    const needs = useHomeNeeds()
    const today = useTodayEvents()
    const counts = needsCounts(needs.items)
    const mentions = needs.items.filter((i) => i.id.startsWith("mention:")).length

    const greetingLine = homeGreeting(
        new Date().getHours(),
        selfProfile.data?.data?.user_full_name,
        selfProfile.data?.data?.user_name,
    )

    const handleAiToggle = () => {
        if (isAiOpen) dispatch(closeRightPanel())
        else dispatch(openRightPanel({ aiChatOpen: true }))
    }

    const loaded = Boolean(sidenav.data?.data)
    const noChannel = loaded && (sidenav.data?.data?.user_channels ?? []).length === 0 && (userSidebar.userChannels ?? []).length === 0

    return (
        <div className="h-full w-full overflow-y-auto" data-home="">
            <div className="mx-auto w-full max-w-[944px] px-6 pb-16 pt-10">
                <Greeting
                    eyebrow={todayEyebrow()}
                    title={greetingLine}
                    rise={rise}
                    now={today.now}
                    events={today.events}
                    chats={userSidebar.userChats ?? []}
                    selfId={needs.selfId}
                    agent={aiAvailable}
                    summary={
                        <GlanceLine
                            loading={needs.loading}
                            counts={{
                                tasksDue: counts.due - counts.overdue,
                                overdue: counts.overdue,
                                mentions,
                                agentRequests: pending.length,
                            }}
                            next={today.next ? { title: today.next.event_title, time: clockTime(today.next.event_start_time), href: "/app/calendar" } : null}
                        />
                    }
                />

                {isAdmin ? (
                    <div className="mt-6 empty:hidden">
                        <SetupChecklist isAdmin={isAdmin} />
                    </div>
                ) : null}

                {/* The two answers. Under 1,100px they stack, what needs me first. */}
                <div
                    {...r(4)}
                    data-home-answers=""
                    className={cn(
                        "mt-8 grid grid-cols-1 gap-8",
                        !today.unavailable && "min-[1100px]:grid-cols-[1.35fr_1fr]",
                        r(4).className,
                    )}
                >
                    <NeedsMe
                        footer={<WhileYouWereAwayCard />}
                        noChannels={noChannel ? <NoChannelsYet /> : undefined}
                        withAI={(p) => <AttentionCard {...p} />}
                    />
                    {!today.unavailable ? <TodayAgenda /> : null}
                </div>

                {/* Agents at work: present only while a job runs. */}
                {below ? <AgentWorkCard className="mt-6" /> : null}

                <div {...r(5)} className={cn("mt-8", r(5).className)}>
                    <ProjectsStrip draw={rise} />
                </div>

                {/* Every section draws its own shape while it loads (design
                    review PG1-04): this row waits a frame for the first paint,
                    and was an empty band till then. */}
                <div {...r(6)} className={cn("mt-8 grid min-h-[176px] grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr]", r(6).className)}>
                    {below ? (
                        <>
                            <JumpBackIn />
                            <CreateTiles aiAvailable={aiAvailable} aiOpen={Boolean(isAiOpen)} onToggleAI={handleAiToggle} />
                        </>
                    ) : (
                        <>
                            <SectionSkeleton title="Jump back in" rows={2} />
                            <SectionSkeleton title="Create" rows={2} />
                        </>
                    )}
                </div>

                {/* Last: it arrives late and may be tall, so it must never push anything. */}
                <div className="mt-10 empty:hidden">{below ? <BriefingCard /> : null}</div>
            </div>
        </div>
    )
}
