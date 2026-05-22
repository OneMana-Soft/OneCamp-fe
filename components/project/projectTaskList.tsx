"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { openUI } from "@/store/slice/uiSlice"
import {
    clearProjectTask,
    type filterInterface,
    type sortingAndFilterOptionInterface,
    type sortInterface,
    updateProjectTaskList,
    updateProjectTaskListTaskStatus,
} from "@/store/slice/taskFilterSlice"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectInfoRawInterface } from "@/types/project"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { CreateTaskInterface, TaskInfoInterface } from "@/types/task"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { TaskListTask } from "@/components/task/taskListTask"
import { usePost } from "@/hooks/usePost"
import { useAnimationState } from "@/hooks/useAnimationState"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Github, Unlink, X } from "@/lib/icons";
import { ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"


interface getURLPramInput {
    sortQuery?: sortInterface[]
    filterQuery?: filterInterface[]
    pageSize: number
    pageIndex: number
    searchText?: string
}
const getURLPram = ({ sortQuery, searchText, filterQuery, pageSize, pageIndex }: getURLPramInput) => {
    const params = new URLSearchParams()

    if (sortQuery && sortQuery.length > 0) {
        params.set("sorting", JSON.stringify(sortQuery))
    }

    if (filterQuery && filterQuery.length > 0) {
        params.set("filters", JSON.stringify(filterQuery))
    }

    params.set("pageSize", pageSize.toString())
    params.set("pageIndex", pageIndex.toString())

    if (searchText) {
        params.set("taskSearchString", searchText)
    }

    return params.toString()
}

const EMPTY_SORT_FILTER: sortingAndFilterOptionInterface = { sort: [], filters: [] }

export const ProjectTaskList = ({ searchQuery, projectId }: { searchQuery: string; projectId: string }) => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [urlParams, setUrlParams] = useState<string>("")
    const pageSize = 10
    const [pageIndex, setPageIndex] = useState(() => {
        const pageFromUrl = searchParams.get("page")
        return pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0
    })
    const dispatch = useDispatch()
    const post = usePost()
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const { animatingSubtasks, triggerAnimation } = useAnimationState()
    const { toast } = useToast()

    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedTaskUUIDs, setSelectedTaskUUIDs] = useState<Set<string>>(new Set())
    const [bulkUnlinking, setBulkUnlinking] = useState(false)

    const taskListState =
        useSelector((state: RootState) => state.taskFilter.projectsTaskList[projectId]) || ([] as TaskInfoInterface[])
    const taskFiltersAndSorts =
        useSelector((state: RootState) => state.taskFilter.projectsSortingAndFilter[projectId]) || EMPTY_SORT_FILTER
    const githubBulkLinkOpen = useSelector((state: RootState) => state.ui.githubBulkLinkTask.isOpen)

    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId && urlParams ? GetEndpointUrl.GetProjectTaskList + "/" + projectId + "?" + urlParams : "",
    )

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", pageIndex.toString())
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [pageIndex, pathname, router])

    useLayoutEffect(() => {
        // Reset this project's task list slot on mount / project switch
        // so a previous project's tasks never bleed in while we wait
        // for the new fetch. Same defence-in-depth as MyTaskList.
        dispatch(clearProjectTask({ projectId }))
        setUrlParams("")
    }, [projectId])

    useEffect(() => {
        const u = getURLPram({
            pageIndex,
            pageSize,
            searchText: searchQuery,
            sortQuery: taskFiltersAndSorts.sort,
            filterQuery: taskFiltersAndSorts.filters,
        })

        setUrlParams(u)
    }, [pageIndex])

    useEffect(() => {
        if (taskFiltersAndSorts.filters || taskFiltersAndSorts.sort) {
            dispatch(clearProjectTask({ projectId }))
        }
        setPageIndex(0)

        const u = getURLPram({
            pageIndex: 0,
            pageSize,
            searchText: searchQuery,
            sortQuery: taskFiltersAndSorts.sort,
            filterQuery: taskFiltersAndSorts.filters,
        })

        setUrlParams(u)
    }, [taskFiltersAndSorts])

    useEffect(() => {
        dispatch(clearProjectTask({ projectId }))
        setPageIndex(0)
        const u = getURLPram({
            pageIndex: 0,
            pageSize,
            searchText: searchQuery,
        })

        setUrlParams(u)
    }, [searchQuery])

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

    const updateTaskStatus = useCallback(
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
        [post, projectInfo],
    )

    const handleLoadMore = () => {
        setPageIndex(pageIndex + 1)
    }

    const handleToggleStatusWithAnimation = useCallback(
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
        [updateTaskStatus, triggerAnimation],
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

    const handleBulkUnlink = useCallback(async () => {
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

    const isAdmin = projectInfo.data?.data.project_is_admin || false

    const handleRenderIndex = useCallback((taskInfo: TaskInfoInterface) => {
        return (
            <TaskListTask
                taskInfo={taskInfo}
                isAdmin={isAdmin}
                onToggleStatus={handleToggleStatusWithAnimation}
                isAnimating={animatingSubtasks.has(taskInfo.task_uuid)}
                selectionMode={selectionMode}
                isSelected={selectedTaskUUIDs.has(taskInfo.task_uuid)}
                onToggleSelect={handleToggleSelect}
            />
        )
    }, [isAdmin, handleToggleStatusWithAnimation, animatingSubtasks, selectionMode, selectedTaskUUIDs, handleToggleSelect])

    const handleItemKey = useCallback((taskInfo: TaskInfoInterface) => {
        return taskInfo.task_uuid
    }, [])

    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Selection mode toggle */}
            {isAdmin && (
                <div className="flex items-center justify-between px-2 py-1.5 flex-shrink-0">
                    {selectionMode ? (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={handleSelectAll}
                            >
                                <ListChecks className="h-3.5 w-3.5" />
                                {selectedTaskUUIDs.size === taskListState.length ? "Deselect All" : "Select All"}
                            </Button>
                            <Badge variant="secondary" className="text-xs">
                                {selectedTaskUUIDs.size} selected
                            </Badge>
                        </div>
                    ) : (
                        <div />
                    )}
                    <Button
                        variant={selectionMode ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs gap-1"
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
                </div>
            )}
            <Separator className="shrink-0" />

            <VirtualInfiniteScroll
                onLoadMore={handleLoadMore}
                hasMore={(projectInfo.data?.pageCount || 0) > pageIndex}
                items={taskListState || []}
                renderItem={handleRenderIndex}
                isLoading={projectInfo.isLoading}
                keyExtractor={handleItemKey}
            />

            {/* Floating action bar */}
            {selectionMode && selectedTaskUUIDs.size > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                    <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border shadow-lg rounded-full px-4 py-2">
                        <Badge variant="secondary" className="text-xs rounded-full">
                            {selectedTaskUUIDs.size}
                        </Badge>
                        <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 rounded-full"
                            onClick={() => dispatch(openUI({ key: 'githubBulkLinkTask', data: { taskIds: Array.from(selectedTaskUUIDs) } }))}
                        >
                            <Github className="h-3.5 w-3.5" />
                            Link to GitHub
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 rounded-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={handleBulkUnlink}
                            disabled={bulkUnlinking}
                        >
                            <Unlink className="h-3.5 w-3.5" />
                            Unlink GitHub
                        </Button>
                        <Button
                            variant="ghost"
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
