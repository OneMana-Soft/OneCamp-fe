"use client"

/**
 * Home on the phone (design v3, hub.md H22), in this order:
 *
 *   1. the greeting with the 96px composition (no day arc, no orbit);
 *   2. for an admin, the setup checklist;
 *   3. what needs me now, rows at a finger's 60px;
 *   4. today, as a strip of event cards;
 *   5. projects.
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
import SetupChecklist, { adminFromSidenav } from "@/components/home/SetupChecklist"
import { NoChannelsYet } from "@/components/home/NoChannelsYet"
import { RootState } from "@/store/store"
import { GlanceLine, todayEyebrow } from "@/components/home/GlanceLine"
import { Greeting } from "@/components/home/Greeting"
import { NeedsMe } from "@/components/home/NeedsMe"
import { useHomeNeeds } from "@/components/home/useHomeNeeds"
import { useTodayEvents } from "@/components/home/useTodayEvents"
import { hhmm } from "@/components/home/homeTime"
import { needsCounts } from "@/components/home/needsMe"
import { useRiseOnce, riseProps } from "@/lib/hub/motion"
import { cn } from "@/lib/utils/helpers/cn"

const TodayStrip = dynamic(() => import("@/components/home/TodayAgenda").then((m) => m.TodayStrip), { ssr: false })
const ProjectsStrip = dynamic(() => import("@/components/home/ProjectsStrip"), { ssr: false })

export function MobileHome() {
    const userSidebar = useSelector((state: RootState) => state.users.userSidebar)
    // Already fetched and deduped by the layout; a cache read, as on desktop.
    const sidenav = useSidenav()
    const self = sidenav.data?.data
    const isAdmin = adminFromSidenav(sidenav)
    const rise = useRiseOnce("/app/home")
    const r = (i: number) => riseProps(rise, i)
    const needs = useHomeNeeds()
    const today = useTodayEvents()
    const counts = needsCounts(needs.items)
    const greetingLine = homeGreeting(new Date().getHours(), self?.user_full_name, self?.user_name)
    const noChannel = Boolean(self) && (self?.user_channels ?? []).length === 0 && (userSidebar.userChannels ?? []).length === 0

    return (
        <div className="flex flex-col gap-6 px-4 pb-6 pt-4" data-home="phone">
            <Greeting
                phone
                eyebrow={todayEyebrow()}
                title={greetingLine}
                rise={rise}
                now={today.now}
                events={today.events}
                chats={userSidebar.userChats ?? []}
                selfId={needs.selfId}
                agent={false}
                summary={
                    <GlanceLine
                        className="line-clamp-2 text-ui"
                        loading={needs.loading}
                        counts={{
                            tasksDue: counts.due - counts.overdue,
                            overdue: counts.overdue,
                            mentions: needs.items.filter((i) => i.id.startsWith("mention:")).length,
                            agentRequests: 0,
                        }}
                        next={today.next ? { title: today.next.event_title, time: hhmm(today.next.event_start_time) } : null}
                    />
                }
            />

            {/* No search bar of its own: the phone top bar's search opens the palette. */}
            {isAdmin ? <SetupChecklist isAdmin={isAdmin} /> : null}

            <div {...r(3)} className={cn(r(3).className)}>
                <NeedsMe noChannels={noChannel ? <NoChannelsYet /> : undefined} />
            </div>

            <TodayStrip />
            <ProjectsStrip />
        </div>
    )
}
