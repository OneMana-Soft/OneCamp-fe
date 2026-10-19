"use client"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLayoutOnce } from "@/components/task/useLayoutOnce"
import {
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
    getCoreRowModel,
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

const ProjectStatusesDialog = dynamic(() => import("@/components/project/ProjectStatusesDialog").then((m) => m.ProjectStatusesDialog), { loading: () => null })
import { whenOf, type TaskGroup } from "@/lib/tasks/grouping"
import { DUE_WEEK, filtersFromAddress, filtersToAddress } from "@/lib/tasks/listAddress"
import { WorkState } from "@/components/task/workFrame"
import { ErrorState } from "@/components/ui/error-state"
import { useProjectTaskColumn } from "@/hooks/useProjectTaskColumn"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { TASK_PAGE, useTaskPages } from "@/components/task/useTaskPages"
import type { ProjectInfoRawInterface } from "@/types/project"
import {useDispatch, useSelector} from "react-redux";
import {clearTaskListVisibleInfo} from "@/store/slice/taskInfoSlice";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import { accessOf, canEditTask } from "@/lib/work/access";
import type { UserProfileInterface } from "@/types/user";
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { useProjectHue } from "@/lib/projectHue"

interface ProjectTaskTableProps {
    projectId: string
    /** The project's tab, so Display's layout switch can move to the board or timeline. */
    onLayout?: (layout: Layout) => void
}

const ALL_PROPS: RowProp[] = ["priority", "labels", "due", "assignee", "estimate", "badges"]
const DISPLAY_DEFAULTS = { grouping: "status" as const, props: PROJECT_PROPS, showCompleted: "all" as const }

// No list in the store yet: one empty list, made once, so the table doesn't
// render again on every change to the store (a new `[]` is never equal to
// the last).
const NO_TASKS: TaskInfoInterface[] = []

const projectTasksOf = (answer: ProjectInfoRawInterface) => answer.data?.project_tasks

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
    const projectHue = useProjectHue(projectId)
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
    const { options: statusOpts } = useProjectStatuses(projectId)
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => filtersFromAddress(searchParams, statusOpts) as ColumnFiltersState)
    const addressKey = ["status", "assignee", "overdue", "due", "filters"].map((k) => searchParams.get(k) ?? "").join("|")
    useEffect(() => {
        const next = filtersFromAddress(searchParams, statusOpts) as ColumnFiltersState
        setColumnFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressKey, statusOpts])
    const [sorting, setSorting] = useState<SortingState>(() => safeJsonParse(searchParams.get("sort"), []))
    const [globalFilter, setGlobalFilter] = useState(() => searchParams.get("search") || "")
    const { display, set: setDisplay, reset: resetDisplay } = useListDisplay(`project:${projectId}`, DISPLAY_DEFAULTS)

    const taskSearchString = useDebounce(globalFilter, 500)

    const apiQueryString = useMemo(() => {
        const params = new URLSearchParams()

        if (sorting.length > 0) {
            params.set("sorting", JSON.stringify(sorting.map(({ id, desc }) => ({ id, desc }))))
        }

        if (columnFilters.length > 0) {
            params.set("filters", JSON.stringify(columnFilters.map(({ id, value }) => ({ id, value }))))
        }

        params.set("pageSize", TASK_PAGE.toString())

        if (taskSearchString) {
            params.set("taskSearchString", taskSearchString)
        }

        return params.toString()
    }, [sorting, columnFilters, taskSearchString])

    // No pages to turn (work.md W18): "Show more" at the foot reads the next.
    const pages = useTaskPages<ProjectInfoRawInterface>(
        projectId && apiQueryString ? `${GetEndpointUrl.GetProjectTaskList}/${projectId}?${apiQueryString}` : "",
        projectTasksOf,
    )

    // Reset taskListVisibleInfo once per project, so a previous project's
    // tasks (or my-task entries) never show through while we wait for the
    // new fetch. The slot is shared between myTaskTable and
    // projectTaskTable in taskInfoSlice. Once, not on every layout effect
    // run: a Suspense boundary showing this list again re-ran a plain one
    // and emptied the list for good (useLayoutOnce).
    useLayoutOnce(projectId, () => dispatch(clearTaskListVisibleInfo()))

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
    })

    // What the reader may do (Work Access); everyone can move through them.
    const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    const project = pages.first?.data?.data
    const access = accessOf(project)
    const canEdit = useCallback((t: TaskInfoInterface) => canEditTask(t, me, project), [me, project])
    // The first rows reach the list through the store, an effect after the
    // answer: until they do, the skeleton stays (not a frame of "No tasks yet").
    const firstLoad = taskListState.length === 0 && (pages.loading || (pages.first?.data?.data.project_tasks?.length ?? 0) > 0)
    const filtered = columnFilters.length > 0 || !!globalFilter
    const failed = !!pages.first?.isError && taskListState.length === 0
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
    const [managing, setManaging] = useState(false)

    return (
        <KeyboardList tasks={taskListState} canEdit={canEdit} listProjectId={projectId} statusOptions={statusOpts}>
            {pages.readers}
            <WorkToolbar
                table={table}
                projectId={projectId}
                canCreate={access.create_tasks}
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
                    <ErrorState subject="this project's tasks" onRetry={() => void pages.first?.mutate()} />
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
                    // More pages to load: a group counts only what has come (PROJ-BUG-2).
                    partial={pages.toCome}
                    filtered={filtered}
                    sortedBy={sortedBy}
                    fields={fields}
                    nameOf={nameOf}
                    onClearFilters={() => {
                        table.resetColumnFilters()
                        table.setGlobalFilter("")
                    }}
                    onAdd={access.create_tasks ? addInGroup : undefined}
                    onManageStatuses={access.manage ? () => setManaging(true) : undefined}
                    empty={
                        <WorkState>
                            <EmptyState
                                illustration={<SpotTasks hue={projectHue} />}
                                title="No tasks yet"
                                description="Make the first one, or bring them in from Linear, Jira, Asana or Trello."
                                action={
                                    <div className="flex items-center gap-2">
                                        {access.create_tasks && <Button size="sm" onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>New task</Button>}
                                        <Button size="sm" variant="secondary" onClick={() => router.push("/app/admin?tab=import")}>Import</Button>
                                    </div>
                                }
                            />
                        </WorkState>
                    }
                />
            )}
            {pages.more && !firstLoad && (
                <button
                    type="button"
                    onClick={pages.showMore}
                    className="flex h-9 w-full items-center pl-[54px] text-left text-ui-sm text-ink-3 hover:bg-hover hover:text-ink-2"
                >
                    Show more tasks
                </button>
            )}
            {access.manage && managing && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
        </KeyboardList>
    )
}
