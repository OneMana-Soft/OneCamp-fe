import { Cross2Icon } from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { useCallback } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CirclePlus } from "lucide-react"
import * as React from "react"
import { useDispatch } from "react-redux"
import { TaskTableViewOptions } from "@/components/task/taskTableViewOptions"
import { TaskTableFacetedStatusFilter } from "@/components/task/taskTableFacetedStatusFilter"
import { TaskTableFacetedProjectFilter } from "@/components/task/taskTableFacetedProjectFilter"
import { TaskTableFacetedAssigneeFilter } from "@/components/task/taskTableFacetedAssigneeFilter"
import { TaskTableFacetedPriorityFilter } from "@/components/task/taskTableFacetedPriorityFilter"
import { openUI } from "@/store/slice/uiSlice"
import { useTranslation } from "react-i18next"

interface DataTableToolbarProps<TData> {
    table: Table<TData>
    projectId?: string
}

export function TaskTableToolbar<TData>({
    table,
    projectId,
}: DataTableToolbarProps<TData>) {
    const dispatch = useDispatch()
    const isFiltered = table.getState().columnFilters.length > 0
    const { t } = useTranslation()

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            table.setGlobalFilter(event.target.value)
        },
        [table],
    )

    const handleResetFilters = useCallback(() => {
        table.resetColumnFilters()
        table.setGlobalFilter("")
    }, [table])

    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                <Input
                    placeholder={t("filterTasksPlaceholder")}
                    value={(table.getState().globalFilter as string) || ""}
                    onChange={handleInputChange}
                    className="h-8 w-[180px] lg:w-[260px]"
                />
                {table.getColumn("task_status") && (
                    <TaskTableFacetedStatusFilter
                        column={table.getColumn("task_status")}
                        title={t("status")}
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
                <Button
                    variant="default"
                    size="sm"
                    className="h-8"
                    onClick={() => dispatch(openUI({ key: "createTask" }))}
                >
                    <CirclePlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("createTask")}</span>
                </Button>
                <TaskTableViewOptions table={table} />
            </div>
        </div>
    )
}
