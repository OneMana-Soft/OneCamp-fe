"use client"

import {useEffect, useMemo, useRef, useState} from "react";
import { useLayoutOnce } from "@/components/task/useLayoutOnce";
import {
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
// <CHANGE> Add Next.js router hooks for URL-based state persistence
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { WorkToolbar, type Layout } from "@/components/task/WorkToolbar";
import { KeyboardList } from "@/components/task/KeyboardList";
import { GroupedTaskList, MINE_PROPS, type RowProp } from "@/components/task/GroupedTaskList";
import { useListDisplay, keepsFinished } from "@/hooks/useListDisplay";
import { Button } from "@/components/ui/button";
import { openUI } from "@/store/slice/uiSlice";
import { WorkState } from "@/components/task/workFrame";
import { ErrorState } from "@/components/ui/error-state";
import {useMyTaskColumn} from "@/hooks/useMyTaskColumn";
import {useDebounce} from "@/hooks/useDebounce";
import {GetEndpointUrl} from "@/services/endPoints";
import { TASK_PAGE, useTaskPages } from "@/components/task/useTaskPages";
import {UserInfoRawInterface} from "@/types/user";
import {clearTaskListVisibleInfo} from "@/store/slice/taskInfoSlice";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import {TaskInfoInterface} from "@/types/task";
import { canEditTask } from "@/lib/work/access";
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { statusOptions } from "@/lib/taskStatus"

// No list in the store yet: one empty list, made once, so the table doesn't
// render again on every change to the store (a new `[]` is never equal to
// the last).
const NO_TASKS: TaskInfoInterface[] = []

const userTasksOf = (answer: UserInfoRawInterface) => answer.data?.user_tasks
const ALL_PROPS: RowProp[] = ["project", "priority", "labels", "due", "estimate", "badges"]
const DISPLAY_DEFAULTS = { grouping: "when" as const, props: MINE_PROPS, showCompleted: "week" as const }

// <CHANGE> Helper function for safe JSON parsing
const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

export const MyTaskTable = ({ onLayout }: { onLayout?: (layout: Layout) => void } = {}) => {
    // <CHANGE> Add Next.js router hooks for URL-based pagination
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const dispatch = useDispatch()

    const [urlParam, setUrlParam] = useState('');

    const taskListState = useSelector(
        (state: RootState) => state.TaskInfo.taskListVisibleInfo || NO_TASKS,
    )

    // No pages to turn (work.md W14): "Show more" at the foot reads the next.
    const pages = useTaskPages<UserInfoRawInterface>(urlParam ? GetEndpointUrl.GetUserTaskList + '?' + urlParam : '', userTasksOf);


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

    const { display, set: setDisplay, reset: resetDisplay } = useListDisplay("mine", DISPLAY_DEFAULTS);

    const taskSearchString = useDebounce(globalFilter, 500);

    const urlUpdateTimeoutRef = useRef<NodeJS.Timeout|null>(null);


    // Reset taskListVisibleInfo once, on mount, so we don't render the
    // previous surface's tasks (e.g. project tasks if user came from
    // /app/project/[id]) while we wait for the new fetch.
    // taskInfoSlice.taskListVisibleInfo is shared between myTaskTable and
    // projectTaskTable. Once only: see useLayoutOnce.
    useLayoutOnce("my-tasks", () => dispatch(clearTaskListVisibleInfo()))

    const {columns} = useMyTaskColumn();
    const table = useReactTable({
        data: taskListState,
        columns,
        state: {
            sorting,
            columnVisibility,
            columnFilters,
            globalFilter,
        },
        getRowId: (originalRow) => originalRow.task_uuid,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
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

        params.set('pageSize', TASK_PAGE.toString());

        if (taskSearchString) {
            params.set('taskSearchString', taskSearchString);
        }

        return params.toString();
    }, [sorting, columnFilters, taskSearchString]);

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
    }, [sorting, columnFilters, columnVisibility, globalFilter, pathname, router]);

    // The first rows reach the list through the store, an effect after the
    // answer, and the request itself starts an effect after the first render.
    // Until the rows are in, the skeleton stays.
    const firstLoad = taskListState.length === 0 && (!urlParam || pages.loading || (pages.first?.data?.data.user_tasks?.length ?? 0) > 0);
    const filtered = columnFilters.length > 0 || !!globalFilter;
    const failed = !!pages.first?.isError && taskListState.length === 0;
    const shown = useMemo(
        () => (display.showCompleted === "all" ? taskListState : taskListState.filter((t) => keepsFinished(t, display.showCompleted))),
        [taskListState, display.showCompleted],
    );
    const sortedBy: RowProp | undefined = sorting[0]?.id === "task_due_date" ? "due" : undefined;

    return (
        <KeyboardList tasks={taskListState} canEdit={canEditMine}>
            {pages.readers}
            <WorkToolbar
                table={table}
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
                    resetDisplay();
                    table.resetColumnFilters();
                    table.setSorting([]);
                    table.setGlobalFilter("");
                }}
            />
            {failed ? (
                <WorkState>
                    <ErrorState subject="your tasks" onRetry={() => void pages.first?.mutate()} />
                </WorkState>
            ) : (
                <GroupedTaskList
                    tasks={shown}
                    options={MINE_OPTIONS}
                    grouping={display.grouping}
                    props={display.props}
                    canEdit={canEditMine}
                    loading={firstLoad}
                    // More pages to load: a group counts only what has come (PROJ-BUG-2).
                    partial={pages.toCome}
                    filtered={filtered}
                    sortedBy={sortedBy}
                    onClearFilters={() => {
                        table.resetColumnFilters();
                        table.setGlobalFilter("");
                    }}
                    empty={
                        <WorkState>
                            <EmptyState
                                illustration={<SpotTasks />}
                                title="Nothing assigned to you"
                                description="Tasks you're given, or make for yourself, land here."
                                action={<Button size="sm" variant="secondary" onClick={() => dispatch(openUI({ key: "createTask", data: { assignToMe: true } }))}>New task</Button>}
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
        </KeyboardList>
    );
};

/** My Tasks spans projects, so it knows only the built-in statuses; a project's own status still reads by its name. */
const MINE_OPTIONS = statusOptions();

/** Tasks here come from many projects; each says what the reader may do with it (task_access, Work Access). */
const canEditMine = (task: TaskInfoInterface) => canEditTask(task)