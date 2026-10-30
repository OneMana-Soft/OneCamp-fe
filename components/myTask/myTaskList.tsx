"use client"

import {useCallback, useEffect, useState} from "react";
import { useLayoutOnce } from "@/components/task/useLayoutOnce";
import { useSearchParams } from "next/navigation"
import { useTabInAddress } from "@/components/task/keptTabs"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
    clearMyTask,
    type sortingAndFilterOptionInterface, updateMyTaskList, updateMyTaskListTaskStatus,
} from "@/store/slice/taskFilterSlice"
import { useFetch } from "@/hooks/useFetch"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import type { CreateTaskInterface, TaskInfoInterface } from "@/types/task"
import { canEditTask } from "@/lib/work/access"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { PhoneListSkeleton } from "@/components/task/phoneListSkeleton"
import { PHONE_ROW_PX, TaskListTask } from "@/components/task/taskListTask"
import {usePost} from "@/hooks/usePost";
import {useAnimationState} from "@/hooks/useAnimationState";
import {UserInfoRawInterface} from "@/types/user";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { NothingAssigned } from "@/components/myTask/nothingAssigned"
import { Search } from "@/lib/icons"
import { PHONE_PAGE_SIZE } from "@/lib/tasks/grouping"
import { taskListQuery } from "@/lib/tasks/listQuery"
import { hasPageAfter } from "@/lib/http/pageCount"


const EMPTY_SORT_FILTER: sortingAndFilterOptionInterface = { sort: [], filters: [] }

export const MyTaskList = ({ searchQuery }: { searchQuery: string }) => {
    const searchParams = useSearchParams()

    const post = usePost()

    const [urlParams, setUrlParams] = useState<string>("")
    const pageSize = PHONE_PAGE_SIZE
    const [pageIndex, setPageIndex] = useState(() => {
        const pageFromUrl = searchParams.get("page")
        return pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0
    })
    const dispatch = useDispatch()
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const { animatingSubtasks, triggerAnimation } = useAnimationState()

    const taskFiltersAndSorts =
        useSelector((state: RootState) => state.taskFilter.myTaskSortingAndFilter) || EMPTY_SORT_FILTER

    const taskListState =
        useSelector((state: RootState) => state.taskFilter.myTaskList) || ([] as TaskInfoInterface[])

    const userInfo = useFetch<UserInfoRawInterface>(
        urlParams ? GetEndpointUrl.GetUserTaskList + "?" + urlParams : "",
    )

    // The page in the address, without a navigation: router.replace fetched
    // the route again on every page a scroll loaded (fluid-17).
    const pageInAddress = useTabInAddress()
    useEffect(() => pageInAddress("page", String(pageIndex)), [pageIndex, pageInAddress])

    // Reset Redux on mount so we don't display stale `myTaskList`
    // entries from a prior visit. Without this, the SWR fetch
    // de-dupes the cached payload and the merge reducer keeps any
    // tasks already in the slice from a previous my-task session
    // until the user reloads. The same applies if the user lands
    // here from /app/project/[id] — Redux holds tasks from the
    // last my-task render and never clears them on route change.
    // Once only (useLayoutOnce): run again by a Suspense boundary
    // showing the page anew, it blanked the list and its address.
    useLayoutOnce("my-tasks", () => {
        dispatch(clearMyTask())
        setUrlParams("")
    })

    useEffect(() => {
        const u = taskListQuery({
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
        dispatch(clearMyTask())
        setPageIndex(0)

        const u = taskListQuery({
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
            <TaskListTask
                showAssignee={false}
                taskInfo={taskInfo}
                isAdmin={canEditTask(taskInfo)}
                onToggleStatus={handleToggleStatusWithAnimation}
                isAnimating={animatingSubtasks.has(taskInfo.task_uuid)}
            />
        )
    }

    const handleItemKey = (taskInfo: TaskInfoInterface) => {
        return taskInfo.task_uuid
    }

    // Before the empty guard. A failed fetch also leaves taskListState empty, and
    // the empty copy here says nothing is assigned — which to someone with
    // forty open tasks is the most misleading sentence the app could produce.
    if (userInfo.isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 w-full h-full min-h-[50vh]">
                <ErrorState subject="your tasks" onRetry={() => void userInfo.mutate()} />
            </div>
        )
    }

    if (!userInfo.isLoading && (!taskListState || taskListState.length === 0)) {
        const isFiltered =
            searchQuery.trim().length > 0 ||
            taskFiltersAndSorts.filters.length > 0
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 w-full h-full min-h-[50vh]">
                {isFiltered ? (
                    <EmptyState icon={Search} title="No tasks found" description="No tasks match your current search or filters." />
                ) : (
                    <NothingAssigned />
                )}
            </div>
        );
    }

    return (
        <VirtualInfiniteScroll
            onLoadMore={handleLoadMore}
            hasMore={hasPageAfter(pageIndex, userInfo.data?.pageCount)}
            items={taskListState || []}
            renderItem={handleRenderIndex}
            isLoading={userInfo.isLoading}
            // The first load is the list's shape, as in a project's list, not
            // "Loading more…" alone at the top of an empty page.
            loadingComponent={(taskListState?.length ?? 0) === 0 ? <PhoneListSkeleton /> : undefined}
            keyExtractor={handleItemKey}
            itemSize={PHONE_ROW_PX}
        />
    )
}
