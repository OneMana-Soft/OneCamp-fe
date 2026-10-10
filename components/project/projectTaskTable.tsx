"use client"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useFitColumns } from "@/hooks/useFitColumns"
import {
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { TableRowsSkeleton } from "@/components/ui/tableRowsSkeleton";
import { useDebounce } from "@/hooks/useDebounce"
import { TaskTablePagination } from "@/components/task/taskTablePagination"
import { TaskTableToolbar } from "@/components/task/taskTableToolbar"
import { KeyboardList, SelectAllHead, TaskTableRow } from "@/components/task/KeyboardList"
import { useProjectTaskColumn } from "@/hooks/useProjectTaskColumn"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import {useDispatch, useSelector} from "react-redux";
import {createListForTaskInfo, clearTaskListVisibleInfo} from "@/store/slice/taskInfoSlice";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import {useTranslation} from "react-i18next";
import { columnAlignClass } from "@/components/task/columnAlign"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { hueFor } from "@/lib/campHue"

interface ProjectTaskTableProps {
    projectId: string
}

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

export const ProjectTaskTable = ({ projectId }: ProjectTaskTableProps) => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const dispatch = useDispatch()

    const {t} = useTranslation()

    const taskListState = useSelector(
        (state: RootState) => state.TaskInfo.taskListVisibleInfo || NO_TASKS,
    )

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
        safeJsonParse(searchParams.get("visibility"), {}),
    )
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
        safeJsonParse(searchParams.get("filters"), []),
    )
    const [sorting, setSorting] = useState<SortingState>(() => safeJsonParse(searchParams.get("sort"), []))
    const [globalFilter, setGlobalFilter] = useState(() => searchParams.get("search") || "")
    const [{ pageIndex, pageSize }, setPagination] = useState(() => {
        const pageFromUrl = searchParams.get("page")
        const sizeFromUrl = searchParams.get("pageSize")
        return {
            pageIndex: pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0,
            pageSize: sizeFromUrl ? Number.parseInt(sizeFromUrl, 10) : 10,
        }
    })

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
            setPagination((prev) => ({ ...prev, pageIndex: 0 }))
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
            const params = new URLSearchParams()

            // Pagination
            params.set("page", pageIndex.toString())
            params.set("pageSize", pageSize.toString())

            // Sorting
            if (sorting.length > 0) {
                params.set("sort", JSON.stringify(sorting))
            }

            // Filters
            if (columnFilters.length > 0) {
                params.set("filters", JSON.stringify(columnFilters))
            }

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
    }, [pageIndex, pageSize, sorting, columnFilters, columnVisibility, globalFilter, pathname, router])

    const pagination = useMemo(
        () => ({
            pageIndex,
            pageSize,
        }),
        [pageIndex, pageSize],
    )

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
    // Columns that step aside when the table is narrow (a panel open beside it).
    const tableBoxRef = useRef<HTMLDivElement>(null)
    // task_cycle never shows, so it takes no room.
    const columnIds = useMemo(
        () => columns.map((c) => String(c.id ?? (c as { accessorKey?: string }).accessorKey ?? "")).filter((id) => id !== "task_cycle"),
        [columns],
    )
    const autoHidden = useFitColumns(tableBoxRef, columnIds, columnVisibility)

    const table = useReactTable({
        data: taskListState,
        columns,
        pageCount,
        state: {
            sorting,
            // task_cycle only carries the cycle filter to the server.
            columnVisibility: { ...columnVisibility, ...autoHidden, task_cycle: false },
            columnFilters,
            globalFilter,
            pagination,
        },
        manualPagination: true,
        getRowId: (originalRow) => originalRow.task_uuid,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    })

    // Only a project's admins change its tasks; everyone can move through them.
    const isAdmin = Boolean(projectInfo.data?.data?.project_is_admin)
    const canEdit = useCallback(() => isAdmin, [isAdmin])
    const rowIds = table.getRowModel().rows.map((r) => r.id)
    // The first rows reach the table through the store, an effect after the
    // answer. Until they do, the skeleton stays (not a frame of "No tasks yet"),
    // and the pagination waits under it: drawn under the skeleton, it moved
    // down as the rows came in (a layout shift opening a project).
    const firstLoad = taskListState.length === 0 && (projectInfo.isLoading || (projectInfo.data?.data.project_tasks?.length ?? 0) > 0)

    return (
        <KeyboardList tasks={taskListState} canEdit={canEdit} listProjectId={projectId} statusOptions={statusOpts} className="space-y-4">
            <TaskTableToolbar table={table} projectId={projectId} />
            <div ref={tableBoxRef} className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                <SelectAllHead ids={rowIds} />
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} colSpan={header.colSpan} className={columnAlignClass(header.column.columnDef.meta)}>
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TaskTableRow key={row.id} id={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className={columnAlignClass(cell.column.columnDef.meta)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                                    ))}
                                </TaskTableRow>
                            ))
                        ) : projectInfo.isLoading || firstLoad ? (
                            <TableRowsSkeleton columns={table.getVisibleLeafColumns().length + 1} />
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="h-24 text-center text-sm text-muted-foreground">
                                    {/* Say which empty this is: a filter that matched nothing, or a project with no tasks (with its spot, in the project's colour). */}
                                    {columnFilters.length > 0 || globalFilter ? (
                                        t("noTasksMatch", { defaultValue: "No tasks match these filters." })
                                    ) : (
                                        <EmptyState
                                            illustration={<SpotTasks hue={hueFor(projectId)} />}
                                            title="No tasks yet"
                                            description="Create one and it shows here."
                                            className="py-8"
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {!firstLoad && <TaskTablePagination table={table} />}
        </KeyboardList>
    )
}
