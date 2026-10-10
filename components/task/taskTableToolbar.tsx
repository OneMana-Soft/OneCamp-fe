import { Cross2Icon } from "@radix-ui/react-icons"
import { Table, type ColumnFiltersState, type SortingState } from "@tanstack/react-table"
import { useCallback } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CirclePlus } from "lucide-react"
import * as React from "react"
import { useDispatch } from "react-redux"
import { TaskTableViewOptions } from "@/components/task/taskTableViewOptions"
import { TaskTableFacetedStatusFilter } from "@/components/task/taskTableFacetedStatusFilter"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { TaskTableFacetedProjectFilter } from "@/components/task/taskTableFacetedProjectFilter"
import { TaskTableFacetedAssigneeFilter } from "@/components/task/taskTableFacetedAssigneeFilter"
import { TaskTableFacetedPriorityFilter } from "@/components/task/taskTableFacetedPriorityFilter"
import { openUI } from "@/store/slice/uiSlice"
import { useTranslation } from "react-i18next"
import { SavedTaskViewsButton } from "@/components/task/savedTaskViews"
import { taskViewScope, type TaskViewState } from "@/lib/tasks/views"
import { CyclesButton } from "@/components/task/cyclesButton"
import { TaskTableFieldFilter } from "@/components/task/taskTableFieldFilter"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { cycleFilter } from "@/lib/tasks/cycles"
import { workToolbar } from "@/components/task/workFrame"
import { cn } from "@/lib/utils/helpers/cn"

interface DataTableToolbarProps<TData> {
    table: Table<TData>
    projectId?: string
}

export function TaskTableToolbar<TData>({
    table,
    projectId,
}: DataTableToolbarProps<TData>) {
    const { options: statusOpts } = useProjectStatuses(projectId)
    const dispatch = useDispatch()
    const isFiltered = table.getState().columnFilters.length > 0
    const { t } = useTranslation()

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            table.setGlobalFilter(event.target.value)
        },
        [table],
    )

    const tableState = table.getState()
    const currentView: TaskViewState = {
        filters: tableState.columnFilters,
        sort: tableState.sorting,
        columns: tableState.columnVisibility,
    }
    const applyView = useCallback(
        (v: TaskViewState) => {
            table.setColumnFilters((v.filters ?? []) as ColumnFiltersState)
            table.setSorting((v.sort ?? []) as SortingState)
            // A view saved on a phone has no column choices; keep these.
            if (v.columns) table.setColumnVisibility(v.columns)
        },
        [table],
    )

    const { fields } = useProjectFields(projectId)
    const { people } = usePeople(projectId, fields)
    const activeCycleId = (tableState.columnFilters.find((f) => f.id === "task_cycle")?.value as string[] | undefined)?.[0]
    const showCycle = useCallback(
        (id: string | null) =>
            table.setColumnFilters((prev) => [...prev.filter((f) => f.id !== "task_cycle"), ...(id ? [cycleFilter(id)] : [])]),
        [table],
    )

    const handleResetFilters = useCallback(() => {
        table.resetColumnFilters()
        table.setGlobalFilter("")
    }, [table])

    return (
        // The tab frame's toolbar row (components/task/workFrame): 32px
        // controls, the filter field included.
        <div data-work-toolbar="" className={cn(workToolbar, "items-start justify-between")}>
            {/* Sized by the room it has, not the window: beside another view
                (split view) or a side panel, the buttons wrap below rather than
                the search box spilling over them. */}
            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[min(100%,18rem)]">
                <Input
                    placeholder={t("filterTasksPlaceholder")}
                    value={(table.getState().globalFilter as string) || ""}
                    onChange={handleInputChange}
                    className="h-8 min-w-[9rem] max-w-[16rem] flex-1 basis-40"
                />
                {table.getColumn("task_status") && (
                    <TaskTableFacetedStatusFilter
                        column={table.getColumn("task_status")}
                        title={t("status")}
                        options={statusOpts}
                    />
                )}
                {table.getColumn("task_priority") && (
                    <TaskTableFacetedPriorityFilter
                        column={table.getColumn("task_priority")}
                        title={t("priority")}
                    />
                )}
                {!projectId && table.getColumn("task_project_name") && (
                    <TaskTableFacetedProjectFilter
                        column={table.getColumn("task_project_name")}
                        title={t("project")}
                    />
                )}
                {projectId && table.getColumn("task_assignee_name") && (
                    <TaskTableFacetedAssigneeFilter
                        column={table.getColumn("task_assignee_name")}
                        title={t("assignee")}
                        projectId={projectId || ""}
                    />
                )}
                {projectId && <TaskTableFieldFilter table={table} fields={fields} people={people} />}
                {isFiltered && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetFilters}
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                        Reset
                        <Cross2Icon className="ml-1 h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {projectId && <CyclesButton projectId={projectId} activeCycleId={activeCycleId} onShow={showCycle} />}
                <SavedTaskViewsButton scope={taskViewScope(projectId)} current={currentView} apply={applyView} />
                <Button
                    variant="default"
                    size="sm"
                    className="h-8"
                    // In a project: that project. On My Tasks: the task is yours.
                    onClick={() => dispatch(openUI({ key: "createTask", data: projectId ? { projectId } : { assignToMe: true } }))}
                >
                    <CirclePlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("createTask")}</span>
                </Button>
                <TaskTableViewOptions table={table} />
            </div>
        </div>
    )
}
