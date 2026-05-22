"use client"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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

import { LoaderCircle } from "@/lib/icons";
import { useDebounce } from "@/hooks/useDebounce"
import { TaskTablePagination } from "@/components/task/taskTablePagination"
import { TaskTableToolbar } from "@/components/task/taskTableToolbar"
import { useProjectTaskColumn } from "@/hooks/useProjectTaskColumn"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import {useDispatch, useSelector} from "react-redux";
import {createListForTaskInfo, clearTaskListVisibleInfo, TaskInfoInputState} from "@/store/slice/taskInfoSlice";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import {useTranslation} from "react-i18next";

interface ProjectTaskTableProps {
    projectId: string
}

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
        (state: RootState) => state.TaskInfo.taskListVisibleInfo || ([] as TaskInfoInterface[]),
    )

    const [rowSelection, setRowSelection] = useState({})
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

    const { columns } = useProjectTaskColumn()

    const table = useReactTable({
        data: taskListState,
        columns,
        pageCount,
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            globalFilter,
            pagination,
        },
        enableRowSelection: true,
        manualPagination: true,
        getRowId: (originalRow) => originalRow.task_uuid,
        onRowSelectionChange: setRowSelection,
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

    return (
        <div className="space-y-4">
            <TaskTableToolbar table={table} projectId={projectId} />
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} colSpan={header.colSpan}>
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    {projectInfo.isLoading ? (
                                        <div className="flex items-center justify-center">
                                            <LoaderCircle className="h-4 w-4 animate-spin" />
                                        </div>
                                    ) : (
                                        t("noResultFound")
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <TaskTablePagination table={table} />
        </div>
    )
}
