"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
    clearProjectSortingFilteringAndTask,
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
import TouchableDiv from "@/components/animation/touchRippleAnimation"
import { usePost } from "@/hooks/usePost"
import { useAnimationState } from "@/hooks/useAnimationState"
import { mutate } from "swr"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"


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

    const taskListState =
        useSelector((state: RootState) => state.taskFilter.projectsTaskList[projectId]) || ([] as TaskInfoInterface[])
    const taskFiltersAndSorts =
        useSelector((state: RootState) => state.taskFilter.projectsSortingAndFilter[projectId]) || EMPTY_SORT_FILTER

    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId && urlParams ? GetEndpointUrl.GetProjectTaskList + "/" + projectId + "?" + urlParams : "",
    )

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", pageIndex.toString())
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [pageIndex, pathname, router])

    useLayoutEffect(() => {
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
                // Fallback to direct toggle without animation
                updateTaskStatus(task_uuid, newStatus)
            }
        },
        [updateTaskStatus, triggerAnimation],
    )

    const handleRenderIndex = (taskInfo: TaskInfoInterface) => {
        return (
            <TouchableDiv rippleBrightness={0.8} rippleDuration={800} className=" m-2 rounded-2xl ">
                <TaskListTask
                    taskInfo={taskInfo}
                    isAdmin={projectInfo.data?.data.project_is_admin || false}
                    onToggleStatus={handleToggleStatusWithAnimation}
                    isAnimating={animatingSubtasks.has(taskInfo.task_uuid)}
                />
            </TouchableDiv>
        )
    }

    const handleItemKey = (taskInfo: TaskInfoInterface) => {
        return taskInfo.task_uuid
    }

    return (
        <VirtualInfiniteScroll
            onLoadMore={handleLoadMore}
            hasMore={(projectInfo.data?.pageCount || 0) > pageIndex}
            items={taskListState || []}
            renderItem={handleRenderIndex}
            isLoading={projectInfo.isLoading}
            keyExtractor={handleItemKey}
        />
    )
}
