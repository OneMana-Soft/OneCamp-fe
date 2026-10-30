"use client"

/**
 * Home on the phone (design v3, hub.md H22), in this order:
 *
 *   1. the greeting with the 96px composition (no day arc, no orbit);
 *   2. for an admin, the setup checklist;
 *   3. what needs me now, rows at a finger's 60px;
 *   4. today, as a strip of event cards;
 *   5. projects;
 *   6. the briefing.
 *
 * No search bar of its own: the top bar's search opens the palette.
 *
 * 16px sides, 24px between sections. The tiles to DMs, channels, docs and
 * tasks are gone (the bottom bar has them), and so are Recent and Channels
 * (the search sheet and the sidebar have them).
 */
import dynamic from "next/dynamic"
import { useSelector } from "react-redux"

import { homeGreeting } from "@/lib/utils/homeGreeting"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { adminFromSidenav, ChecklistPlace } from "@/components/home/setupChecklistPlace"
import { RootState } from "@/store/store"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { GlanceLine, glanceNext, glanceOf, todayEyebrow } from "@/components/home/GlanceLine"
import { Greeting } from "@/components/home/Greeting"
import { NeedsMe } from "@/components/home/NeedsMe"
import { useTodayEvents } from "@/components/home/useTodayEvents"
import { NeedsGoneContext, useNeedsGoneState } from "@/components/home/needsGone"
import { useRiseOnce, riseProps } from "@/lib/hub/motion"
import { cn } from "@/lib/utils/helpers/cn"
import BriefingCard from "@/components/ai/BriefingCard"
import AttentionCard from "@/components/ai/AttentionCard"
import WhileYouWereAwayCard from "@/components/ai/WhileYouWereAwayCard"
import { AgentWorkCard } from "@/components/ai/AgentWorkCard"

// The setup checklist, a chunk of its own: only an admin with steps left sees
// it. Its place is held while it comes (setupChecklistPlace).
const SetupChecklist = dynamic(() => import("@/components/home/SetupChecklist"), { ssr: false, loading: ChecklistPlace })
// Only a member in no channel sees it (H7), so it comes in its own chunk then.
const NoChannelsYet = dynamic(() => import("@/components/home/NoChannelsYet").then((m) => m.NoChannelsYet), { ssr: false })
const TodayStrip = dynamic(() => import("@/components/home/TodayAgenda").then((m) => m.TodayStrip), { ssr: false })
const ProjectsStrip = dynamic(() => import("@/components/home/ProjectsStrip"), { ssr: false })

export function MobileHome() {
    const userSidebar = useSelector((state: RootState) => state.users.userSidebar)
    // Already fetched and deduped by the layout; a cache read, as on desktop.
    const sidenav = useSidenav()
    const self = sidenav.data?.data
    const isAdmin = adminFromSidenav(sidenav)
    const aiAvailable = useAIAvailable()
    const rise = useRiseOnce("/app/home")
    const r = (i: number) => riseProps(rise, i)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const today = useTodayEvents()
    // What the list below shows, which it tells this page as it draws: the
    // line says exactly that, and Done takes a task off both (needsGone).
    const needsGone = useNeedsGoneState()
    const glance = glanceOf(needsGone.shown)
    // From the member's own profile, as on a computer: /user/sidebarNav doesn't select user_full_name.
    const greetingLine = homeGreeting(new Date().getHours(), selfProfile.data?.data)
    const noChannel = Boolean(self) && (self?.user_channels ?? []).length === 0 && (userSidebar.userChannels ?? []).length === 0

    return (
        <NeedsGoneContext.Provider value={needsGone}>
            <div className="flex flex-col gap-6 px-4 pb-6 pt-4" data-home="phone">
                <Greeting
                    phone
                    eyebrow={todayEyebrow()}
                    title={greetingLine}
                    rise={rise}
                    now={today.now}
                    events={today.events}
                    chats={userSidebar.userChats ?? []}
                    selfId={selfProfile.data?.data?.user_uuid}
                    agent={aiAvailable}
                    summary={
                        <GlanceLine
                            stacked
                            className="text-ui"
                            loading={glance.loading}
                            counts={glance.counts}
                            unnamed={glance.unnamed}
                            failed={glance.failed}
                            next={glanceNext(today.next, today.now)}
                        />
                    }
                />

                {/* No search bar of its own: the phone top bar's search opens the palette. */}
                {isAdmin ? <SetupChecklist isAdmin={isAdmin} /> : null}

                <div {...r(3)} className={cn(r(3).className)}>
                    <NeedsMe
                        footer={<WhileYouWereAwayCard />}
                        noChannels={noChannel ? <NoChannelsYet /> : undefined}
                        withAI={(p) => <AttentionCard {...p} />}
                    />
                </div>

                <TodayStrip />
                <AgentWorkCard />
                <ProjectsStrip />
                <BriefingCard />
            </div>
        </NeedsGoneContext.Provider>
    )
}
