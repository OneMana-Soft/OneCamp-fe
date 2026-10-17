"use client"
import { useTranslation } from "react-i18next";

import { useFetch } from "@/hooks/useFetch"
import {GetEndpointUrl} from "@/services/endPoints"
import {ProjectInfoRawInterface} from "@/types/project"
import { FileText, List, Megaphone, Paperclip } from "@/lib/icons";
import { TabLoading } from "@/components/task/TabLoading"
import { lazyView } from "@/components/task/LazyView"
import { ProjectActionsMenu } from "@/components/project/ProjectToolButtons";
import { Kanban } from "@/lib/icons";
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { WorkTabsList } from "@/components/task/WorkTabs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { ChevronRight } from "@/lib/icons"
import Link from "next/link"
import { app_project_path } from "@/types/paths"
import type { UserProfileDataInterface } from "@/types/user"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { displayNameOf } from "@/lib/personName"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { ProjectTaskTable } from "@/components/project/projectTaskTable"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { ProjectHeaderLine } from "@/components/project/ProjectHeaderLine"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

// Only the tab that is open loads (work.md, the route's size): the board, the
// timeline, the updates and the files are chunks of their own, each held at
// its height by a skeleton while it arrives, and warmed while the page idles.
const Board = lazyView(() => import("@/components/project/projectTaskKanban"))
const Timeline = lazyView(() => import("@/components/project/timeline/ProjectTimeline"))
const Updates = lazyView(() => import("@/components/projectUpdates/ProjectUpdates"))
const Files = lazyView(() => import("@/components/project/ProjectAttachments"))
// The project's docs: the pages made in its space (docs programme B5).
const Docs = lazyView(() => import("@/components/docTree/SpaceDocs"))
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { ChartGantt } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { countAddress } from "@/lib/tasks/listAddress"
import { useState, useEffect, useCallback, startTransition } from "react"
import { KeptTab, useSeenTabs, useTabInAddress } from "@/components/task/keptTabs"
import { NotificationLevelMenu } from "@/components/Notification/notificationLevels";
import { useProjectNotification } from "@/hooks/useNotificationLevel";
import { useProjectHue } from "@/lib/projectHue";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";

const VALID_TABS = ["list", "kanban", "timeline", "updates", "attachments", "docs"] as const
type TabValue = (typeof VALID_TABS)[number]

export const ProjectTaskDesktop = ({ projectId }: { projectId: string }) => {
    const { t } = useTranslation()
    const projectHue = useProjectHue(projectId)
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)

    const dispatch = useDispatch()
    const isAdmin = !!projectInfo.data?.data.project_is_admin
    const isMember = !!projectInfo.data?.data.project_is_member

    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "list"
    })
    const seen = useSeenTabs(selectedTab)
    const tabInAddress = useTabInAddress()

    const notification = useProjectNotification(projectId, projectInfo.data?.data.notification_type)

    // The underline moves at once; the tab's content follows as a transition,
    // which a further click can interrupt.
    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            startTransition(() => setSelectedTab(value as TabValue))
        }
    }, [])

    useEffect(() => tabInAddress("tab", selectedTab), [selectedTab, tabInAddress])

    // The other tabs' chunks load once the list has painted and the page is
    // idle, so the first screen stays small and a tab switch still finds its
    // view ready (the board tab was 300 ms slower when it waited for a click).
    useEffect(() => {
        const warm = () => {
            void Board.warm()
            void Timeline.warm()
        }
        const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
        if (w.requestIdleCallback) {
            const id = w.requestIdleCallback(warm, { timeout: 2500 })
            return () => w.cancelIdleCallback?.(id)
        }
        const t = window.setTimeout(warm, 1200)
        return () => window.clearTimeout(t)
    }, [])

    // 1 to 5 switch tabs (work.md W17), while nothing else has the keys.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
            const el = e.target as HTMLElement | null
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest("[role=dialog],[role=menu],[data-right-panel]"))) return
            const n = Number(e.key)
            if (n >= 1 && n <= VALID_TABS.length) handleTabChange(VALID_TABS[n - 1])
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [handleTabChange])

    const project = projectInfo.data?.data
    const memberInfo = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectMemberInfo}/${projectId}` : "")
    const members = memberInfo.data?.data.project_members ?? project?.project_members ?? []
    const loading = !project && projectInfo.isLoading

    return (
        // A container, so the header gives way when a side panel narrows the
        // page: the member stack and the "Projects" crumb go before the
        // project's name is cut or the stack draws over the crumb.
        <div className="@container flex h-full flex-col overflow-hidden">
            {/* The project's light (work.md W16): a radial of its hue, only in
                the top band of its own page, from where its tile sits. */}
            <div className={cn(HUE_CLASS[projectHue], "relative isolate")}>
                <div aria-hidden="true" data-project-band="" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[120px] [background:radial-gradient(420px_120px_at_40px_40px,color-mix(in_oklab,var(--hue)_7%,transparent),transparent)] dark:[background:radial-gradient(420px_120px_at_40px_40px,color-mix(in_oklab,var(--hue)_9%,transparent),transparent)]" />
                {/* The sheet's header bar: where you are, who is here, and the project's tools. */}
                <div className="flex h-[52px] items-center gap-3 px-6">
                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
                        <Link href={app_project_path} className="shrink-0 rounded-sm hover:text-foreground @max-[560px]:hidden">Projects</Link>
                        <ChevronRight className="size-3.5 shrink-0 text-ink-3 @max-[560px]:hidden" aria-hidden="true" />
                        <ProjectTile id={projectId} size={16} />
                        <span className="truncate font-[590] text-foreground">{project?.project_name || "\u00a0"}</span>
                    </nav>
                    <span className="flex-1" />
                    {members.length > 0 && <span className="shrink-0 @max-[640px]:hidden"><MemberStack members={members} /></span>}
                    {(isMember || isAdmin) && (
                        <div className="flex items-center gap-0.5">
                            <NotificationLevelMenu level={notification.level} onChoose={notification.choose} />
                            <ProjectActionsMenu
                                projectId={projectId}
                                projectName={project?.project_name}
                                isAdmin={isAdmin}
                                isMember={isMember}
                                archived={!isZeroEpoch(project?.project_deleted_at || "")}
                                onRename={() => dispatch(openUI({ key: 'editProjectName', data: { projectUUID: projectId || "" } }))}
                                onMembers={() => dispatch(openUI({ key: 'editProjectMember', data: { projectUUID: projectId || "" } }))}
                            />
                        </div>
                    )}
                </div>
                {/* The hero: the tile at 36, the name, and where it stands. */}
                <header className="flex items-start gap-3.5 px-6 pb-3.5 pt-[22px]">
                    {/* From the id, so it is there from the first paint. */}
                    <ProjectTile id={projectId} size={36} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <h1 className="truncate text-title-1 text-foreground">
                            {loading ? <span aria-label="Loading" className="block h-[30px] w-[180px] rounded-md bg-press" /> : project?.project_name || "\u00a0"}
                        </h1>
                        <ProjectHeaderLine
                            projectId={projectId}
                            projectName={project?.project_name}
                            onOpenUpdates={() => handleTabChange("updates")}
                            onPickCount={(kind) => {
                                // A push, so Back takes the filter off again.
                                handleTabChange("list")
                                router.push(`${pathname}?${countAddress(new URLSearchParams(searchParams.toString()), kind)}`, { scroll: false })
                            }}
                        />
                    </div>
                </header>
            </div>

            {projectId && (
                <Tabs value={selectedTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
                    <WorkTabsList
                        value={selectedTab}
                        tabs={[
                            { value: "list", label: t("list", { defaultValue: "List" }), icon: <List /> },
                            { value: "kanban", label: t("board", { defaultValue: "Board" }), icon: <Kanban /> },
                            { value: "timeline", label: "Timeline", icon: <ChartGantt /> },
                            { value: "updates", label: "Updates", icon: <Megaphone /> },
                            { value: "attachments", label: "Files", icon: <Paperclip />, count: project?.project_attachments?.length },
                            { value: "docs", label: "Docs", icon: <FileText /> },
                        ]}
                    />
                    {/* One scroll container for every tab's body. The panels
                        crossfade as they change (120 ms, opacity). */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {/* Kept alive once seen: going back to a tab is instant. */}
                        <KeptTab value="list" selected={selectedTab === "list"} seen={seen.has("list")} className="mt-0 h-full data-[state=active]:[animation:work-fade-in_120ms_var(--ease-out)]">
                            <ProjectTaskTable projectId={projectId} onLayout={(l) => handleTabChange(l)} />
                        </KeptTab>
                        <KeptTab value="kanban" selected={selectedTab === "kanban"} seen={seen.has("kanban")} className="mt-0 h-full data-[state=active]:[animation:work-fade-in_120ms_var(--ease-out)]">
                            <Board.View fallback={<TabLoading kind="board" />} render={(m) => <m.ProjectTaskKanban projectId={projectId} className="px-5 pt-3" />} />
                        </KeptTab>
                        <KeptTab value="timeline" selected={selectedTab === "timeline"} seen={seen.has("timeline")} className="mt-0 h-full data-[state=active]:[animation:work-fade-in_120ms_var(--ease-out)]">
                            <Timeline.View
                                fallback={<TabLoading kind="timeline" />}
                                render={(m) => (
                                    <m.ProjectTimeline
                                        key={projectId}
                                        projectId={projectId}
                                        onOpenTask={(taskUUID) => dispatch(openRightPanel({ taskUUID }))}
                                        onCreateTask={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}
                                    />
                                )}
                            />
                        </KeptTab>
                        <TabsContent value="updates" className="mt-0 [animation:work-fade-in_120ms_var(--ease-out)]">
                            <Updates.View fallback={<TabLoading kind="list" />} render={(m) => <m.ProjectUpdates projectId={projectId} />} />
                        </TabsContent>
                        <TabsContent value="attachments" className="mt-0 [animation:work-fade-in_120ms_var(--ease-out)]">
                            <Files.View fallback={<TabLoading kind="list" />} render={(m) => <m.ProjectAttachments projectId={projectId} projectName={project?.project_name} canLink={isMember} />} />
                        </TabsContent>
                        <TabsContent value="docs" className="mt-0 [animation:work-fade-in_120ms_var(--ease-out)]">
                            <Docs.View fallback={<TabLoading kind="list" />} render={(m) => <m.default space={`project:${projectId}` as const} name={project?.project_name} />} />
                        </TabsContent>
                    </div>
                </Tabs>
            )}
        </div>
    )
}

/** Who is in the project: 22 px avatars, four then "+3", overlapping by 6 px on a 2 px sheet ring. */
function MemberStack({ members }: { members: UserProfileDataInterface[] }) {
    const shown = members.slice(0, 4)
    const more = members.length - shown.length
    return (
        <span className="flex items-center" aria-label={`${members.length} ${members.length === 1 ? "member" : "members"}`} role="img">
            {shown.map((m, i) => (
                <span key={m.user_uuid} className={cn("rounded-full ring-2 ring-sheet", i > 0 && "-ml-1.5")}>
                    <MemberFace user={m} />
                </span>
            ))}
            {more > 0 && <span className="-ml-1.5 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-press px-1 text-3xs font-[510] text-ink-2 ring-2 ring-sheet">+{more}</span>}
        </span>
    )
}

function MemberFace({ user }: { user: UserProfileDataInterface }) {
    const { src } = useUserAvatar(user.user_profile_object_key)
    return <IdentityMark variant="avatar" id={avatarSeed(user)} label={displayNameOf(user)} src={src} size={22} />
}
