"use client"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"

import { useRouter, useSearchParams, usePathname } from "next/navigation"

import { useDebounce } from "@/hooks/useDebounce"
import { WorkToolbar, type Layout } from "@/components/task/WorkToolbar"
import { KeyboardList } from "@/components/task/KeyboardList"
import { GroupedTaskList, PROJECT_PROPS, type RowProp } from "@/components/task/GroupedTaskList"
import { useListDisplay, keepsFinished } from "@/hooks/useListDisplay"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { PostEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { Button } from "@/components/ui/button"
import dynamic from "next/dynamic"

const ProjectStatusesDialog = dynamic(() => import("@/components/project/ProjectStatusesDialog").then((m) => m.ProjectStatusesDialog))
import { whenOf, type TaskGroup } from "@/lib/tasks/grouping"
import { DUE_WEEK, filtersFromAddress, filtersToAddress } from "@/lib/tasks/listAddress"
import { WorkState } from "@/components/task/workFrame"
import { ErrorState } from "@/components/ui/error-state"
import { useProjectTaskColumn } from "@/hooks/useProjectTaskColumn"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import {useDispatch, useSelector} from "react-redux";
import {createListForTaskInfo, clearTaskListVisibleInfo} from "@/store/slice/taskInfoSlice";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { hueFor } from "@/lib/campHue"

interface ProjectTaskTableProps {
    projectId: string
    /** The project's tab, so Display's layout switch can move to the board or timeline. */
    onLayout?: (layout: Layout) => void
}

/** How many tasks the list asks for at once; "Show more" at the foot asks for this many again. */
const LIST_PAGE = 500
const ALL_PROPS: RowProp[] = ["priority", "labels", "due", "assignee", "estimate", "badges"]
const DISPLAY_DEFAULTS = { grouping: "status" as const, props: PROJECT_PROPS, showCompleted: "all" as const }

// No list in the store yet: one empty list, made once, so the table doesn't
// render again on every change to the store (a new `[]` is never equal to
// the last).
const NO_TASKS: TaskInfoInterface[] = []

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

export const ProjectTaskTable = ({ projectId, onLayout }: ProjectTaskTableProps) => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const dispatch = useDispatch()


    const taskListState = useSelector(
        (state: RootState) => state.TaskInfo.taskListVisibleInfo || NO_TASKS,
    )

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
        safeJsonParse(searchParams.get("visibility"), {}),
    )
    // Status, assignee, overdue and due-this-week are words in the address
    // (?status=open), the rest JSON (lib/tasks/listAddress), so a header count
    // can filter the list and Back can take it off again.
    const { options: addressOpts } = useProjectStatuses(projectId)
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => filtersFromAddress(searchParams, addressOpts) as ColumnFiltersState)
    const addressKey = ["status", "assignee", "overdue", "due", "filters"].map((k) => searchParams.get(k) ?? "").join("|")
    useEffect(() => {
        const next = filtersFromAddress(searchParams, addressOpts) as ColumnFiltersState
        setColumnFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressKey, addressOpts])
    const [sorting, setSorting] = useState<SortingState>(() => safeJsonParse(searchParams.get("sort"), []))
    const [globalFilter, setGlobalFilter] = useState(() => searchParams.get("search") || "")
    // No pages (work.md W18): the list asks for a large first batch and,
    // in the rare project with more, more of them at the foot.
    const [pageSize, setPageSize] = useState(LIST_PAGE)
    const pageIndex = 0
    const { display, set: setDisplay, reset: resetDisplay } = useListDisplay(`project:${projectId}`, DISPLAY_DEFAULTS)

    const prevTaskSearchStringRef = useRef("")
    const prevColumnFiltersRef = useRef<ColumnFiltersState>([])
    const isInitialMountRef = useRef(true)

    const taskSearchString = useDebounce(globalFilter, 500)

    const apiQueryString = useMemo(() => {
        const params = new URLSearchParams()

        if (sorting.length > 0) {
            params.set("sorting", JSON.stringify(sorting.map(({ id, desc }) => ({ id, desc }))))
        }

        if (columnFilters.length > 0) {
            params.set("filters", JSON.stringify(columnFilters.map(({ id, value }) => ({ id, value }))))
        }

        params.set("pageSize", pageSize.toString())
        params.set("pageIndex", pageIndex.toString())

        if (taskSearchString) {
            params.set("taskSearchString", taskSearchString)
        }

        return params.toString()
    }, [sorting, columnFilters, pageSize, pageIndex, taskSearchString])

    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId && apiQueryString ? `${GetEndpointUrl.GetProjectTaskList}/${projectId}?${apiQueryString}` : "",
    )

    useEffect(() => {
        // Skip on initial mount
        if (isInitialMountRef.current) {
            isInitialMountRef.current = false
            prevTaskSearchStringRef.current = taskSearchString
            prevColumnFiltersRef.current = columnFilters
            return
        }

        const searchChanged = prevTaskSearchStringRef.current !== taskSearchString
        const filtersChanged = JSON.stringify(prevColumnFiltersRef.current) !== JSON.stringify(columnFilters)

        if (searchChanged || filtersChanged) {
            setPageSize(LIST_PAGE)
            prevTaskSearchStringRef.current = taskSearchString
            prevColumnFiltersRef.current = columnFilters
        }
    }, [taskSearchString, columnFilters])

    useLayoutEffect(() => {
        // Reset taskListVisibleInfo on mount / project change so a
        // previous project's tasks (or my-task entries) never show
        // through while we wait for the new fetch. The slot is shared
        // between myTaskTable and projectTaskTable in
        // taskInfoSlice.
        dispatch(clearTaskListVisibleInfo())
    }, [projectId])

    useEffect(() => {

        if(projectInfo.data?.data.project_tasks) {
            dispatch(createListForTaskInfo({tasksInfo: projectInfo.data?.data.project_tasks}))
        }

    }, [projectInfo.data?.data.project_tasks]);

    const debouncedUrlUpdateRef = useRef<NodeJS.Timeout|null>(null)

    useEffect(() => {
        // Clear previous timeout
        if (debouncedUrlUpdateRef.current) {
            clearTimeout(debouncedUrlUpdateRef.current)
        }

        // Debounce URL updates to avoid excessive router.replace calls
        debouncedUrlUpdateRef.current = setTimeout(() => {
            // Keeps what the page put there (the tab), rewrites the list's own.
            const params = new URLSearchParams(searchParams.toString())
            for (const k of ["sort", "visibility", "search"]) params.delete(k)

            // Sorting
            if (sorting.length > 0) {
                params.set("sort", JSON.stringify(sorting))
            }

            // Filters
            filtersToAddress(params, columnFilters, statusOpts)

            // Column visibility
            if (Object.keys(columnVisibility).length > 0) {
                params.set("visibility", JSON.stringify(columnVisibility))
            }

            // Global search filter
            if (globalFilter) {
                params.set("search", globalFilter)
            }

            const newUrl = `${pathname}?${params.toString()}`
            const currentUrl = `${pathname}?${searchParams.toString()}`

            // Only update if URL actually changed
            if (newUrl !== currentUrl) {
                router.replace(newUrl, { scroll: false })
            }
        }, 300) // 300ms debounce

        return () => {
            if (debouncedUrlUpdateRef.current) {
                clearTimeout(debouncedUrlUpdateRef.current)
            }
        }
    }, [sorting, columnFilters, columnVisibility, globalFilter, pathname, router])

    const pageCount = projectInfo.data?.pageCount || 1

    const { options: statusOpts } = useProjectStatuses(projectId)
    const { fields, isLoading: fieldsLoading, isError: fieldsFailed } = useProjectFields(projectId)
    const { nameOf } = usePeople(projectId, fields)
    const { columns } = useProjectTaskColumn(statusOpts, fields, nameOf)
    // A saved view or a link can name a field since deleted: its filter goes,
    // rather than narrowing the list to a field nobody can see.
    useEffect(() => {
        if (fieldsLoading || fieldsFailed) return
        const live = new Set(fields.map((f) => f.filter_id))
        setColumnFilters((prev) => {
            const next = prev.filter((f) => !f.id.startsWith("field_") || live.has(f.id))
            return next.length === prev.length ? prev : next
        })
    }, [fields, fieldsLoading, fieldsFailed])
    const table = useReactTable({
        data: taskListState,
        columns,
        pageCount,
        state: {
            sorting,
            // task_cycle only carries the cycle filter to the server.
            columnVisibility: { ...columnVisibility, task_cycle: false },
            columnFilters,
            globalFilter,
        },
        getRowId: (originalRow) => originalRow.task_uuid,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    })

    // Only a project's admins change its tasks; everyone can move through them.
    const isAdmin = Boolean(projectInfo.data?.data?.project_is_admin)
    const canEdit = useCallback(() => isAdmin, [isAdmin])
    // The first rows reach the list through the store, an effect after the
    // answer: until they do, the skeleton stays (not a frame of "No tasks yet").
    const firstLoad = taskListState.length === 0 && (projectInfo.isLoading || (projectInfo.data?.data.project_tasks?.length ?? 0) > 0)
    const filtered = columnFilters.length > 0 || !!globalFilter
    const failed = projectInfo.isError && taskListState.length === 0
    const dueWeek = columnFilters.some((f) => f.id === DUE_WEEK)
    const shown = useMemo(() => {
        let tasks = display.showCompleted === "all" ? taskListState : taskListState.filter((t) => keepsFinished(t, display.showCompleted))
        // Due this week has no server filter: it is the list's own.
        if (dueWeek) tasks = tasks.filter((t) => ["today", "week"].includes(whenOf(t)))
        return tasks
    }, [taskListState, display.showCompleted, dueWeek])
    const sortedBy: RowProp | undefined = sorting[0]?.id === "task_due_date" ? "due" : undefined

    const post = usePost()
    const { revalidateTaskKeys } = useTaskUpdate()
    const addInGroup = useCallback(
        async (group: TaskGroup, name: string) => {
            const res = await post.makeRequest<Record<string, unknown>, { task_uuid?: string }>({
                apiEndpoint: PostEndpointUrl.CreateTask,
                payload: { task_name: name, task_project_uuid: projectId },
            })
            const status = group.status?.value
            if (res?.task_uuid && status && status !== "todo") {
                await post.makeRequest({ apiEndpoint: PostEndpointUrl.UpdateTaskStatus, payload: { task_uuid: res.task_uuid, task_status: status, task_project_uuid: projectId } })
            }
            revalidateTaskKeys(projectId)
        },
        [post, projectId, revalidateTaskKeys],
    )
    const moreToLoad = (projectInfo.data?.pageCount ?? 1) > 1
    const [managing, setManaging] = useState(false)

    return (
        <KeyboardList tasks={taskListState} canEdit={canEdit} listProjectId={projectId} statusOptions={statusOpts}>
            <WorkToolbar
                table={table}
                projectId={projectId}
                grouping={display.grouping}
                onGrouping={(grouping) => setDisplay({ grouping })}
                props={display.props}
                allProps={ALL_PROPS}
                onProps={(props) => setDisplay({ props })}
                showCompleted={display.showCompleted}
                onShowCompleted={(showCompleted) => setDisplay({ showCompleted })}
                layout="list"
                onLayout={onLayout}
                onReset={() => {
                    resetDisplay()
                    table.resetColumnFilters()
                    table.setSorting([])
                    table.setGlobalFilter("")
                }}
            />
            {failed ? (
                <WorkState>
                    <ErrorState subject="this project's tasks" onRetry={() => void projectInfo.mutate()} />
                </WorkState>
            ) : (
                <GroupedTaskList
                    tasks={shown}
                    options={statusOpts}
                    grouping={display.grouping}
                    props={display.props}
                    canEdit={canEdit}
                    projectId={projectId}
                    loading={firstLoad}
                    filtered={filtered}
                    sortedBy={sortedBy}
                    fields={fields}
                    nameOf={nameOf}
                    onClearFilters={() => {
                        table.resetColumnFilters()
                        table.setGlobalFilter("")
                    }}
                    onAdd={isAdmin ? addInGroup : undefined}
                    onManageStatuses={isAdmin ? () => setManaging(true) : undefined}
                    empty={
                        <WorkState>
                            <EmptyState
                                illustration={<SpotTasks hue={hueFor(projectId)} />}
                                title="No tasks yet"
                                description="Make the first one, or bring them in from Linear, Jira, Asana or Trello."
                                action={
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>New task</Button>
                                        <Button size="sm" variant="secondary" onClick={() => router.push("/app/admin?tab=import")}>Import</Button>
                                    </div>
                                }
                            />
                        </WorkState>
                    }
                />
            )}
            {moreToLoad && !firstLoad && (
                <button
                    type="button"
                    onClick={() => setPageSize((n) => n + LIST_PAGE)}
                    className="flex h-9 w-full items-center pl-[54px] text-left text-ui-sm text-ink-3 hover:bg-hover hover:text-ink-2"
                >
                    Show more tasks
                </button>
            )}
            {isAdmin && managing && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
        </KeyboardList>
    )
}
