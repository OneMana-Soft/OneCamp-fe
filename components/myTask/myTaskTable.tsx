"use client"

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
// <CHANGE> Add Next.js router hooks for URL-based state persistence
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {TaskTableToolbar} from "@/components/task/taskTableToolbar";
import {TaskTablePagination} from "@/components/task/taskTablePagination";
import { KeyboardList, SelectAllHead, TaskTableRow } from "@/components/task/KeyboardList";
import {useMyTaskColumn} from "@/hooks/useMyTaskColumn";
import {useDebounce} from "@/hooks/useDebounce";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {UserInfoRawInterface} from "@/types/user";
import {createListForTaskInfo, clearTaskListVisibleInfo} from "@/store/slice/taskInfoSlice";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import {useTranslation} from "react-i18next";
import { TableRowsSkeleton } from "@/components/ui/tableRowsSkeleton";
import { useFitColumns } from "@/hooks/useFitColumns";
import { columnAlignClass } from "@/components/task/columnAlign"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"

// No list in the store yet: one empty list, made once, so the table doesn't
// render again on every change to the store (a new `[]` is never equal to
// the last).
const NO_TASKS: TaskInfoInterface[] = []

// <CHANGE> Helper function for safe JSON parsing
const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

export const MyTaskTable = () => {
    // <CHANGE> Add Next.js router hooks for URL-based pagination
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const dispatch = useDispatch()

    const [urlParam, setUrlParam] = useState('');
    const userInfo = useFetch<UserInfoRawInterface>(urlParam ? GetEndpointUrl.GetUserTaskList + '?' + urlParam : '');

    const taskListState = useSelector(
        (state: RootState) => state.TaskInfo.taskListVisibleInfo || NO_TASKS,
    )
    const {t} = useTranslation()


    // <CHANGE> Initialize all states from URL parameters
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
        safeJsonParse(searchParams.get("visibility"), {})
    );

    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
        safeJsonParse(searchParams.get("filters"), [])
    );

    const [sorting, setSorting] = useState<SortingState>(() =>
        safeJsonParse(searchParams.get("sort"), [])
    );

    const [globalFilter, setGlobalFilter] = useState(() =>
        searchParams.get("search") || ""
    );

    const [{ pageIndex, pageSize }, setPagination] = useState(() => {
        const pageFromUrl = searchParams.get("page");
        const sizeFromUrl = searchParams.get("pageSize");
        return {
            pageIndex: pageFromUrl ? Number.parseInt(pageFromUrl, 10) : 0,
            pageSize: sizeFromUrl ? Number.parseInt(sizeFromUrl, 10) : 10,
        };
    });

    const taskSearchString = useDebounce(globalFilter, 500);

    // <CHANGE> Use refs to track previous values without causing re-renders
    const prevTaskSearchStringRef = useRef(taskSearchString);
    const hasFiltersChangedRef = useRef(false);
    const urlUpdateTimeoutRef = useRef<NodeJS.Timeout|null>(null);

    const pagination = useCallback(
        () => ({
            pageIndex,
            pageSize,
        }),
        [pageIndex, pageSize]
    );

    useLayoutEffect(() => {
        // Reset taskListVisibleInfo on mount so we don't render the
        // previous surface's tasks (e.g. project tasks if user came
        // from /app/project/[id]) while we wait for the new fetch.
        // taskInfoSlice.taskListVisibleInfo is shared between
        // myTaskTable and projectTaskTable.
        dispatch(clearTaskListVisibleInfo())
    }, [])

    useEffect(() => {

        if(userInfo.data?.data.user_tasks) {
            dispatch(createListForTaskInfo({tasksInfo: userInfo.data?.data.user_tasks}))
        }

    }, [userInfo.data?.data.user_tasks]);

    const pageCount = userInfo.data?.pageCount || 1;
    const {columns} = useMyTaskColumn();
    // Columns that step aside when the table is narrow (a panel open beside it).
    const tableBoxRef = useRef<HTMLDivElement>(null)
    const columnIds = useMemo(() => columns.map((c) => String(c.id ?? (c as { accessorKey?: string }).accessorKey ?? "")), [columns])
    const autoHidden = useFitColumns(tableBoxRef, columnIds, columnVisibility)

    const table = useReactTable({
        data: taskListState,
        columns,
        pageCount,
        state: {
            sorting,
            columnVisibility: { ...columnVisibility, ...autoHidden },
            columnFilters,
            globalFilter,
            pagination: pagination(),
        },
        manualPagination: true,
        getRowId: (originalRow) => originalRow.task_uuid,
        onSortingChange: setSorting,
        onColumnFiltersChange: (c) => {
            hasFiltersChangedRef.current = true;
            setColumnFilters(c);
        },
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    });

    // <CHANGE> Memoized query string builder for API calls only
    const apiQueryString = useMemo(() => {
        const params = new URLSearchParams();

        if (sorting.length > 0) {
            params.set('sorting', JSON.stringify(sorting.map(({ id, desc }) => ({ id, desc }))));
        }

        if (columnFilters.length > 0) {
            params.set('filters', JSON.stringify(columnFilters.map(({ id, value }) => ({ id, value }))));
        }

        params.set('pageSize', pageSize.toString());
        params.set('pageIndex', pageIndex.toString());

        if (taskSearchString) {
            params.set('taskSearchString', taskSearchString);
        }

        return params.toString();
    }, [sorting, columnFilters, pageSize, pageIndex, taskSearchString]);

    // <CHANGE> Effect to handle page reset when filters or search changes
    useEffect(() => {
        const searchChanged = prevTaskSearchStringRef.current !== taskSearchString;
        const filtersChanged = hasFiltersChangedRef.current;

        if (searchChanged || filtersChanged) {
            table.setPageIndex(0);
            prevTaskSearchStringRef.current = taskSearchString;
            hasFiltersChangedRef.current = false;
        }
    }, [taskSearchString, table]);

    // <CHANGE> Effect to update API query string
    useEffect(() => {
        setUrlParam(apiQueryString);
    }, [apiQueryString]);

    // <CHANGE> Debounced effect to sync table state with URL (300ms debounce)
    useEffect(() => {
        if (urlUpdateTimeoutRef.current) {
            clearTimeout(urlUpdateTimeoutRef.current);
        }

        urlUpdateTimeoutRef.current = setTimeout(() => {
            const params = new URLSearchParams();

            // Pagination
            params.set("page", pageIndex.toString());
            params.set("pageSize", pageSize.toString());

            // Sorting
            if (sorting.length > 0) {
                params.set("sort", JSON.stringify(sorting));
            }

            // Filters
            if (columnFilters.length > 0) {
                params.set("filters", JSON.stringify(columnFilters));
            }

            // Column visibility
            if (Object.keys(columnVisibility).length > 0) {
                params.set("visibility", JSON.stringify(columnVisibility));
            }

            // Global search filter
            if (globalFilter) {
                params.set("search", globalFilter);
            }

            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }, 300);

        return () => {
            if (urlUpdateTimeoutRef.current) {
                clearTimeout(urlUpdateTimeoutRef.current);
            }
        };
    }, [pageIndex, pageSize, sorting, columnFilters, columnVisibility, globalFilter, pathname, router]);

    const rowIds = table.getRowModel().rows.map((r) => r.id);
    // The first rows reach the table through the store, an effect after the
    // answer, and the request itself starts an effect after the first render
    // (its query comes from the address). Until the rows are in, the skeleton
    // stays (not a frame of "Nothing is assigned to you"), and the pagination
    // waits under it rather than move down as the rows come in.
    const firstLoad = taskListState.length === 0 && (!urlParam || userInfo.isLoading || (userInfo.data?.data.user_tasks?.length ?? 0) > 0);

    return (
        <KeyboardList tasks={taskListState} canEdit={canEditTask} className="space-y-4">
            <TaskTableToolbar table={table} />
            <div ref={tableBoxRef} className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                <SelectAllHead ids={rowIds} />
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} colSpan={header.colSpan} className={columnAlignClass(header.column.columnDef.meta)}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
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
                                        <TableCell key={cell.id} className={columnAlignClass(cell.column.columnDef.meta)}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TaskTableRow>
                            ))
                        ) : userInfo.isLoading || firstLoad ? (
                            <TableRowsSkeleton columns={table.getVisibleLeafColumns().length + 1} />
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="h-24 text-center text-sm text-muted-foreground">
                                    {table.getState().columnFilters.length > 0 || table.getState().globalFilter ? (
                                        t("noTasksMatch", { defaultValue: "No tasks match these filters." })
                                    ) : (
                                        <EmptyState illustration={<SpotTasks />} title={t("noTasksAssigned", { defaultValue: "Nothing is assigned to you." })} className="py-8" />
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {!firstLoad && <TaskTablePagination table={table} />}
        </KeyboardList>
    );
};

/** Tasks here come from many projects; each is changed by its own project's admins. */
const canEditTask = (task: TaskInfoInterface) => Boolean(task.task_project?.project_is_admin)