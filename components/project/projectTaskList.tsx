"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { PhoneListSkeleton } from "@/components/task/phoneListSkeleton"
import { PHONE_PAGE_SIZE, groupTasks, headedRows, type GroupHeaderRow } from "@/lib/tasks/grouping"
import { projectTaskListQuery } from "@/lib/tasks/listQuery"
import { isManualSort } from "@/lib/tasks/manualSort"
// The phone's list is a chunk of its own (the project's first screen is the
// desktop list): the drag comes with it, so nothing loads in under a finger.
import { ReorderLayer } from "@/components/task/listReorder"
import { ReorderHost } from "@/components/task/reorderSlot"
import { hasPageAfter, pagesToCome } from "@/lib/http/pageCount"
import type { StatusOption } from "@/lib/taskStatus"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { useLayoutOnce } from "@/components/task/useLayoutOnce"
import { useSearchParams } from "next/navigation"
import { useTabInAddress } from "@/components/task/keptTabs"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { openUI } from "@/store/slice/uiSlice"
import {
    clearProjectTask,
    type sortingAndFilterOptionInterface,
    updateProjectSortingAndFiltering,
    updateProjectTaskList,
    updateProjectTaskListTaskStatus,
} from "@/store/slice/taskFilterSlice"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectInfoRawInterface } from "@/types/project"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { CreateTaskInterface, TaskInfoInterface } from "@/types/task"
import { accessOf, canEditTask } from "@/lib/work/access"
import { useMyId } from "@/hooks/useMyId"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { PHONE_ROW_PX, TaskListTask } from "@/components/task/taskListTask"
import { usePost } from "@/hooks/usePost"
import { useAnimationState } from "@/hooks/useAnimationState"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Github, Unlink, X } from "@/lib/icons";
import { ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotSearch, SpotTasks } from "@/components/ui/graphics/spots"
import { useProjectHue } from "@/lib/projectHue"


const EMPTY_SORT_FILTER: sortingAndFilterOptionInterface = { sort: [], filters: [] }

// No list in the store yet: one empty list, made once (a new [] each render
// never equals the last).
const NO_TASKS: TaskInfoInterface[] = []

export const ProjectTaskList = ({ searchQuery, projectId, search }: { searchQuery: string; projectId: string; search?: ReactNode }) => {
    const projectHue = useProjectHue(projectId)
    const searchParams = useSearchParams()

    const [urlParams, setUrlParams] = useState<string>("")
    const pageSize = PHONE_PAGE_SIZE
    const [pageIndex, setPageIndex] = useState(() => {
        const pageFromUrl = searchParams.get("page")
        return pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0
    })
    const dispatch = useDispatch()
    const post = usePost()
    const confirm = useConfirm()
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const { animatingSubtasks, triggerAnimation } = useAnimationState()
    const { toast } = useToast()

    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedTaskUUIDs, setSelectedTaskUUIDs] = useState<Set<string>>(new Set())
    const [bulkUnlinking, setBulkUnlinking] = useState(false)

    const taskListState =
        useSelector((state: RootState) => state.taskFilter.projectsTaskList[projectId]) || NO_TASKS
    const taskFiltersAndSorts =
        useSelector((state: RootState) => state.taskFilter.projectsSortingAndFilter[projectId]) || EMPTY_SORT_FILTER
    const githubBulkLinkOpen = useSelector((state: RootState) => state.ui.githubBulkLinkTask.isOpen)

    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId && urlParams ? GetEndpointUrl.GetProjectTaskList + "/" + projectId + "?" + urlParams : "",
    )

    // The page in the address, without a navigation: router.replace fetched
    // the route again on every page a scroll loaded (fluid-17).
    const pageInAddress = useTabInAddress()
    useEffect(() => pageInAddress("page", String(pageIndex)), [pageIndex, pageInAddress])

    // Reset this project's task list slot once per project, so a previous
    // project's tasks never bleed in while we wait for the new fetch. Same
    // defence-in-depth as MyTaskList, and once only, as there
    // (useLayoutOnce).
    useLayoutOnce(projectId, () => {
        dispatch(clearProjectTask({ projectId }))
        setUrlParams("")
    })

    useEffect(() => {
        const u = projectTaskListQuery({
            pageIndex,
            pageSize,
            search: searchQuery,
            sort: taskFiltersAndSorts.sort,
            filters: taskFiltersAndSorts.filters,
        }).toString()

        setUrlParams(u)
    }, [pageIndex])

    // A new sort, filter or search reads the list again from its first page,
    // with all three: a search's own read used to leave the sort and filters out.
    useEffect(() => {
        dispatch(clearProjectTask({ projectId }))
        setPageIndex(0)

        const u = projectTaskListQuery({
            pageIndex: 0,
            pageSize,
            search: searchQuery,
            sort: taskFiltersAndSorts.sort,
            filters: taskFiltersAndSorts.filters,
        }).toString()

        setUrlParams(u)
    }, [taskFiltersAndSorts, searchQuery])

    useEffect(() => {
        if (
            (projectInfo.data?.data.project_tasks && taskListState.length == 0) ||
            (projectInfo.data?.data.project_tasks &&
                taskListState.length > 0 &&
                taskListState[taskListState.length - 1].task_uuid != projectInfo.data?.data.project_tasks[0].task_uuid)
        ) {
            dispatch(updateProjectTaskList({ projectId, tasks: projectInfo.data?.data.project_tasks }))
        }
    }, [projectInfo.data?.data])

    // The rows' handlers never change (fluid-17): a page arriving gave
    // projectInfo a new answer and drew every row again through them.
    const updateTaskStatus = useStableCallback(
        (id: string, status: string) => {
            if (!status || !id || !projectInfo.data?.data || post.isSubmitting) return

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
                    payload: {
                        task_status: status,
                        task_uuid: id,
                        task_project_uuid: projectInfo.data?.data.project_uuid,
                    },
                })
                .then(() => {
                    dispatch(
                        updateProjectTaskListTaskStatus({
                            status,
                            projectId: projectInfo.data?.data.project_uuid || "",
                            taskUUID: id,
                        }),
                    )
                    optimisticUpdateTask({ task_uuid: id, task_status: status }, projectInfo.data?.data.project_uuid || "");
                    revalidateTaskKeys(projectInfo.data?.data.project_uuid || "");
                })
        },
    )

    const handleLoadMore = () => {
        setPageIndex(pageIndex + 1)
    }

    const handleToggleStatusWithAnimation = useStableCallback(
        (task_uuid: string, projectId: string, newStatus: "done" | "todo") => {
            try {
                if (newStatus === "done") {
                    triggerAnimation(task_uuid)
                }

                updateTaskStatus(task_uuid, newStatus)
            } catch (error) {
                console.error("Error handling subtask status toggle:", error)
                updateTaskStatus(task_uuid, newStatus)
            }
        },
    )

    const handleToggleSelect = useCallback((taskUUID: string) => {
        setSelectedTaskUUIDs(prev => {
            const next = new Set(prev)
            if (next.has(taskUUID)) {
                next.delete(taskUUID)
            } else {
                next.add(taskUUID)
            }
            return next
        })
    }, [])

    const handleSelectAll = useCallback(() => {
        if (selectedTaskUUIDs.size === taskListState.length) {
            setSelectedTaskUUIDs(new Set())
        } else {
            setSelectedTaskUUIDs(new Set(taskListState.map(t => t.task_uuid)))
        }
    }, [selectedTaskUUIDs.size, taskListState])

    const handleExitSelectionMode = useCallback(() => {
        setSelectionMode(false)
        setSelectedTaskUUIDs(new Set())
    }, [])

    // Exit selection mode when bulk link dialog closes
    const prevBulkLinkOpen = useRef(githubBulkLinkOpen)
    useEffect(() => {
        if (prevBulkLinkOpen.current && !githubBulkLinkOpen) {
            handleExitSelectionMode()
            revalidateTaskKeys(projectId)
        }
        prevBulkLinkOpen.current = githubBulkLinkOpen
    }, [githubBulkLinkOpen, handleExitSelectionMode, revalidateTaskKeys, projectId])

    const bulkUnlink = useCallback(async () => {
        if (selectedTaskUUIDs.size === 0) return
        setBulkUnlinking(true)
        try {
            const res = await post.makeRequest<{ task_uuids: string[] }, { success_count: number }>({
                apiEndpoint: PostEndpointUrl.GitHubBulkUnlink,
                payload: { task_uuids: Array.from(selectedTaskUUIDs) },
                showErrorToast: true,
            })
            toast({
                title: "Unlinked",
                description: `Removed GitHub links from ${res?.success_count || selectedTaskUUIDs.size} tasks.`,
            })
            handleExitSelectionMode()
            revalidateTaskKeys(projectId)
        } catch {
            // Error toast handled by usePost
        } finally {
            setBulkUnlinking(false)
        }
    }, [selectedTaskUUIDs, projectId, revalidateTaskKeys, handleExitSelectionMode, post])

    // The worst of the unguarded destructive actions, so it is confirmed and the
    // prompt states the COUNT. It strips GitHub links from an arbitrary selection in
    // one click with no undo, and rebuilding them means finding each issue URL by
    // hand. "Unlink 14 tasks?" is a question someone can actually answer; a bare
    // "are you sure?" is not.
    const handleBulkUnlink = useCallback(() => {
        const count = selectedTaskUUIDs.size
        if (count === 0) return
        confirm({
            title: count === 1 ? "Unlink 1 task from GitHub?" : `Unlink ${count} tasks from GitHub?`,
            description:
                "The tasks stay, but their GitHub links are removed. Relinking has to be done one task at a time.",
            confirmText: count === 1 ? "Unlink task" : `Unlink ${count} tasks`,
            onConfirm: () => {
                void bulkUnlink()
            },
        })
    }, [selectedTaskUUIDs, confirm, bulkUnlink])

    // Which tasks the reader changes, and whether they add them, are the
    // server's answer (Work Access).
    const me = useMyId()
    const project = projectInfo.data?.data
    const access = accessOf(project)
    const changesTasks = access.edit_tasks !== "none"

    // The rows grouped by status, as on a computer (work.md W53, the mock's
    // "In progress 2 / To do 2"): the phone listed them in the server's order,
    // done tasks between open ones. A group's header is a row of its own.
    const { options: statusOpts } = useProjectStatuses(projectId)
    // Pages still to come: a group counts only what has arrived, and says so
    // ("To do 4+"), until the last page's tasks are in the list. Its bare count
    // read as the whole and grew while the list scrolled (PROJ-BUG-2). Neither
    // loading nor the page count says it alone: the page wanted moves a render
    // before its request starts (handleLoadMore), and an answer's tasks reach
    // the list in the effect above, a render after it comes. The page asked
    // for is the one the request's address names.
    const answer = projectInfo.data
    const inList = useMemo(() => {
        if (!answer) return false
        const ids = new Set(taskListState.map((t) => t.task_uuid))
        return (answer.data.project_tasks ?? []).every((t) => ids.has(t.task_uuid))
    }, [answer, taskListState])
    const more = pagesToCome({
        wanted: pageIndex,
        asked: Number(new URLSearchParams(urlParams).get("pageIndex") ?? 0),
        loading: projectInfo.isLoading,
        inList,
        pageCount: answer?.pageCount,
    })
    const rows = useMemo<PhoneRow[]>(() => headedRows(taskListState || [], "status", statusOpts, more), [taskListState, statusOpts, more])

    const handleRenderIndex = useCallback((item: PhoneRow) => {
        if ("kind" in item) return <PhoneGroupHeader label={item.label} count={item.count} status={item.status} />
        const taskInfo = item
        return (
            <TaskListTask
                showProject={false}
                taskInfo={taskInfo}
                isAdmin={canEditTask(taskInfo, me, project)}
                onToggleStatus={handleToggleStatusWithAnimation}
                isAnimating={animatingSubtasks.has(taskInfo.task_uuid)}
                selectionMode={selectionMode}
                isSelected={selectedTaskUUIDs.has(taskInfo.task_uuid)}
                onToggleSelect={handleToggleSelect}
            />
        )
    }, [me, project, handleToggleStatusWithAnimation, animatingSubtasks, selectionMode, selectedTaskUUIDs, handleToggleSelect])

    const handleItemKey = useCallback((item: PhoneRow) => ("kind" in item ? item.key : item.task_uuid), [])

    // Rows a hold lifts into the project's one manual order (L-1), as on a
    // computer; sorted another way, a move asks to switch back.
    const listBox = useRef<HTMLDivElement>(null)
    const groups = useMemo(() => groupTasks(taskListState, "status", statusOpts), [taskListState, statusOpts])
    const canEdit = useCallback((t: TaskInfoInterface) => canEditTask(t, me, project), [me, project])
    const phoneSort = taskFiltersAndSorts.sort
    const phoneFilters = taskFiltersAndSorts.filters
    const reorder = useMemo(
        () => ({
            projectId,
            manual: isManualSort(phoneSort ?? []),
            sortedBy: PHONE_SORT_WORDS[phoneSort?.[0]?.id ?? ""],
            onManual: () => dispatch(updateProjectSortingAndFiltering({ projectId, filters: phoneFilters ?? [], sort: [] })),
        }),
        [projectId, phoneSort, phoneFilters, dispatch],
    )

    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Search, and Select beside it: they took two rows, about 170 px
                above the first task (PTC-43). While selecting, Select all and the
                count take a row of their own under them. */}
            <div data-list-search-row="" className="flex shrink-0 items-center pr-2">
                <div className="min-w-0 flex-1">{search}</div>
                {changesTasks && (
                    <Button
                        variant={selectionMode ? "secondary" : "ghost"}
                        size="sm"
                        className="h-11 shrink-0 gap-1 text-xs"
                        onClick={() => {
                            if (selectionMode) {
                                handleExitSelectionMode()
                            } else {
                                setSelectionMode(true)
                            }
                        }}
                    >
                        {selectionMode ? (
                            <><X className="h-3.5 w-3.5" /> Done</>
                        ) : (
                            <><ListChecks className="h-3.5 w-3.5" /> Select</>
                        )}
                    </Button>
                )}
            </div>
            {changesTasks && selectionMode && (
                <div className="flex shrink-0 items-center gap-2 px-2 pb-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 text-xs gap-1"
                        onClick={handleSelectAll}
                    >
                        <ListChecks className="h-3.5 w-3.5" />
                        {selectedTaskUUIDs.size === taskListState.length ? "Clear selection" : "Select all"}
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                        {selectedTaskUUIDs.size} selected
                    </Badge>
                </div>
            )}
            <Separator className="shrink-0" />

            {/* A project with no tasks said nothing at all on a phone. */}
            {projectInfo.isError && taskListState.length === 0 ? (
                <ErrorState subject="this project's tasks" onRetry={() => void projectInfo.mutate()} />
            ) : !projectInfo.isLoading && projectInfo.data && taskListState.length === 0 && (projectInfo.data.data.project_tasks?.length ?? 0) === 0 ? (
                searchQuery ? (
                    <EmptyState illustration={<SpotSearch />} title={`No tasks match “${searchQuery}”.`} />
                ) : (
                    <EmptyState
                        illustration={<SpotTasks hue={projectHue} />}
                        title="No tasks yet"
                        description="Make the first one, and it shows here."
                        // The empty page's way forward, as on a computer: it had none.
                        action={access.create_tasks ? <Button size="sm" onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>New task</Button> : undefined}
                    />
                )
            ) : (
            <ReorderHost>
                <div ref={listBox} className="flex min-h-0 flex-1 flex-col">
                    <VirtualInfiniteScroll
                        onLoadMore={handleLoadMore}
                        hasMore={hasPageAfter(pageIndex, projectInfo.data?.pageCount)}
                        items={rows}
                        renderItem={handleRenderIndex}
                        isLoading={projectInfo.isLoading}
                        // The first load is the list's shape, not "Loading more…".
                        loadingComponent={(taskListState?.length ?? 0) === 0 ? <PhoneListSkeleton /> : undefined}
                        keyExtractor={handleItemKey}
                        itemSize={PHONE_ROW_PX}
                    />
                </div>
                <ReorderLayer {...reorder} tasks={taskListState} groups={groups} grouping="status" options={statusOpts} canEdit={canEdit} box={listBox} />
            </ReorderHost>
            )}

            {/* Floating action bar */}
            {selectionMode && selectedTaskUUIDs.size > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                    <div className="flex items-center gap-2 bg-card border shadow-e3 rounded-full px-4 py-2">
                        <Badge variant="secondary" className="text-xs rounded-full">
                            {selectedTaskUUIDs.size}
                        </Badge>
                        <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 rounded-full"
                            onClick={() => dispatch(openUI({ key: 'githubBulkLinkTask', data: { taskIds: Array.from(selectedTaskUUIDs) } }))}
                        >
                            <Github className="h-3.5 w-3.5" />
                            Link to GitHub…
                        </Button>
                        <Button
                            data-tone="danger"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 rounded-full text-danger-ink hover:text-danger-ink border-destructive/30"
                            onClick={handleBulkUnlink}
                            disabled={bulkUnlinking}
                        >
                            <Unlink className="h-3.5 w-3.5" />
                            Unlink GitHub
                        </Button>
                        <Button
 aria-label="Exit selection mode"                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-full"
                            onClick={handleExitSelectionMode}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

        </div>
    )
}

type PhoneRow = TaskInfoInterface | GroupHeaderRow

const PHONE_SORT_WORDS: Record<string, string> = { task_due_date: "due date", task_start_date: "start date", task_created_date: "date created" }

/** A status group's header on a phone: its glyph, its name and its count, on the sunken surface. */
function PhoneGroupHeader({ label, count, status }: { label: string; count: string; status?: StatusOption }) {
    return (
        <div data-phone-group="" className="flex h-9 items-center gap-2 border-b border-line bg-sunken px-4 text-ui-sm font-[510] text-foreground">
            {status && <StatusGlyph status={statusKindOf(status)} hue={status.hue} />}
            <span className="min-w-0 truncate">{label}</span>
            <span className="text-ink-3 tabular-nums" data-group-count="">
                {count}
            </span>
        </div>
    )
}
