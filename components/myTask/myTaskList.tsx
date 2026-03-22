"use client"

import React, {useCallback, useEffect, useLayoutEffect, useMemo, useState} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
    clearMyTask,
    clearMyTaskSortingFilteringAndTask,
    type filterInterface,
    type sortingAndFilterOptionInterface,
    type sortInterface, updateMyTaskList, updateMyTaskListTaskStatus,
} from "@/store/slice/taskFilterSlice"
import { useFetch } from "@/hooks/useFetch"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {CreateTaskInterface, TaskInfoInterface} from "@/types/task"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { TaskListTask } from "@/components/task/taskListTask"
import TouchableDiv from "@/components/animation/touchRippleAnimation"
import {usePost} from "@/hooks/usePost";
import {useAnimationState} from "@/hooks/useAnimationState";
import {UserInfoRawInterface} from "@/types/user";
import {mutate} from "swr";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"

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

export const MyTaskList = ({ searchQuery }: { searchQuery: string }) => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const post = usePost()

    const [urlParams, setUrlParams] = useState<string>("")
    const pageSize = 10
    const [pageIndex, setPageIndex] = useState(() => {
        const pageFromUrl = searchParams.get("page")
        return pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0
    })
    const dispatch = useDispatch()
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const { animatingSubtasks, triggerAnimation } = useAnimationState()

    const taskFiltersAndSorts =
        useSelector((state: RootState) => state.taskFilter.myTaskSortingAndFilter) || EMPTY_SORT_FILTER

    const fetchMyTaskParam = useMemo(() => ({
        pageIndex,
        pageSize,
        searchText: searchQuery,
        sortQuery: taskFiltersAndSorts.sort,
        filterQuery: taskFiltersAndSorts.filters,
    }), [pageIndex, pageSize, searchQuery, taskFiltersAndSorts.sort, taskFiltersAndSorts.filters]);

    const taskListState =
        useSelector((state: RootState) => state.taskFilter.myTaskList) || ([] as TaskInfoInterface[])

    const userInfo = useFetch<UserInfoRawInterface>(
        urlParams ? GetEndpointUrl.GetUserTaskList + "?" + urlParams : "",
    )

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", pageIndex.toString())
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [pageIndex, pathname, router])

    useLayoutEffect(() => {
        setUrlParams("")
    }, [])

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
            dispatch(clearMyTask())
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
        dispatch(clearMyTask())
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
            (userInfo.data?.data.user_tasks && taskListState.length == 0) ||
            (userInfo.data?.data.user_tasks &&
                taskListState.length > 0 &&
                taskListState[taskListState.length - 1].task_uuid != userInfo.data?.data.user_tasks?.[0].task_uuid)
        ) {
            dispatch(updateMyTaskList({  tasks: userInfo.data?.data.user_tasks||[] }))
        }
    }, [userInfo.data?.data.user_tasks])

    const updateTaskStatus = useCallback(
        ( id: string, projectUUID: string, status: string) => {
            if (!status || !id || !userInfo.data?.data || post.isSubmitting) return

            post
                .makeRequest<CreateTaskInterface>({
                    apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
                    payload: {
                        task_status: status,
                        task_uuid: id,
                        task_project_uuid: projectUUID,
                    },
                })
                .then(() => {
                    dispatch(updateMyTaskListTaskStatus({
                        status,
                        taskUUID: id

                    }))
                    optimisticUpdateTask({ task_uuid: id, task_status: status }, projectUUID);
                    revalidateTaskKeys(projectUUID);
                })
        },
        [post],
    )

    const handleLoadMore = () => {
        setPageIndex(pageIndex + 1)
    }

    const handleToggleStatusWithAnimation = useCallback((task_uuid: string, projectUUID: string, newStatus: "done" | "todo") => {
        try {
            if (newStatus === "done") {

                triggerAnimation(task_uuid)

            }

            updateTaskStatus(task_uuid, projectUUID, newStatus)
        } catch (error) {
            console.error('Error handling subtask status toggle:', error)
            // Fallback to direct toggle without animation
            updateTaskStatus(task_uuid, projectUUID, newStatus)
        }
    }, [updateTaskStatus, triggerAnimation])

    const handleRenderIndex = (taskInfo: TaskInfoInterface) => {
        return (
            <TouchableDiv rippleBrightness={0.8} rippleDuration={800} className=" m-2 rounded-2xl ">
                <TaskListTask
                    taskInfo={taskInfo}
                    isAdmin={taskInfo.task_project.project_is_admin || false}
                    onToggleStatus={handleToggleStatusWithAnimation}
                    isAnimating={animatingSubtasks.has(taskInfo.task_uuid)}
                />
            </TouchableDiv>
        )
    }

    const handleItemKey = (taskInfo: TaskInfoInterface) => {
        return taskInfo.task_uuid
    }

    if (!userInfo.isLoading && (!taskListState || taskListState.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 w-full h-full min-h-[50vh]">
                <StatePlaceholder
                    type="empty"
                    title="No tasks found"
                    description="You're all caught up! Enjoy your free time or create a new task to get started."
                />
            </div>
        );
    }

    return (
        <VirtualInfiniteScroll
            onLoadMore={handleLoadMore}
            hasMore={(userInfo.data?.pageCount || 0) > pageIndex}
            items={taskListState || []}
            renderItem={handleRenderIndex}
            isLoading={userInfo.isLoading}
            keyExtractor={handleItemKey}
        />
    )
}
