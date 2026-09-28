import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CirclePlus } from "lucide-react"
import { useDispatch } from "react-redux"
import { TaskKanbanColumnPriorityFilter } from "@/components/task/taskKanbanColumnPriorityFilter"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectInfoRawInterface } from "@/types/project"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import type { TaskInfoInterface } from "@/types/task"
import { openUI } from "@/store/slice/uiSlice"
import { ProjectTaskKanbanAssigneeFilter } from "@/components/project/projectTaskKanbanAssigneeFilter"
import { useMoveTask } from "@/hooks/useMoveTask"
import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { columnsByStatus, statusPatch } from "@/lib/taskStatus"
import { ProjectStatusesDialog } from "@/components/project/ProjectStatusesDialog"
import { TaskBoard } from "@/components/kanbanComponents/TaskBoard"

const EMPTY: TaskInfoInterface[] = []

export const ProjectTaskKanban = ({ projectId = "" }: { projectId?: string }) => {
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const moveTask = useMoveTask()

    const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
    const [priorityFilter, setPriorityFilter] = useState<string[]>([])
    const [viewableStatus, setColumnShown] = useBoardColumns({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false,
    })

    const urlParam = GetTaskStatusQueryParamByStatus({ assigneeFilter, priorityFilter })
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId ? `${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}?${urlParam}` : "",
    )
    const p = projectInfo.data?.data
    // Unknown until the project loads; the server checks again on every move.
    const isAdmin = p?.project_is_admin !== undefined ? Boolean(p.project_is_admin) : false

    // One column per status: the built-in ones, each followed by the project's
    // own that count as it (the server groups tasks by category only).
    const { options: statusOpts } = useProjectStatuses(projectId)
    const [managing, setManaging] = useState(false)
    const columns = useMemo(
        () =>
            columnsByStatus(
                {
                    backlog: p?.project_tasks_backlog ?? EMPTY,
                    todo: p?.project_tasks_todo ?? EMPTY,
                    inProgress: p?.project_tasks_in_progress ?? EMPTY,
                    inReview: p?.project_tasks_in_review ?? EMPTY,
                    done: p?.project_tasks_done ?? EMPTY,
                    canceled: p?.project_tasks_canceled ?? EMPTY,
                },
                statusOpts,
            ),
        [p, statusOpts],
    )
    const visible = useMemo(() => statusOpts.filter((o) => isShown(viewableStatus, o.value)), [statusOpts, viewableStatus])

    return (
        <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex mb-4 justify-between">
                <div className="flex space-x-2">
                    <ProjectTaskKanbanAssigneeFilter activeList={assigneeFilter} updateList={setAssigneeFilter} members={p?.project_members} />
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter} />
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex" onClick={() => dispatch(openUI({ key: "createTask" }))}>
                        <CirclePlus className="h-4 w-4" /> {t("createTask")}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
                                <MixerHorizontalIcon className="mr-2 h-4 w-4" />
                                {t("view")}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {statusOpts.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.value}
                                    className={column.custom ? "pl-10" : undefined}
                                    checked={isShown(viewableStatus, column.value)}
                                    onCheckedChange={(value) => setColumnShown(column.value, value)}
                                >
                                    {column.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setManaging(true)}>Manage statuses…</DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="flex-1 overflow-hidden mt-2">
                <div className="h-full">
                    <TaskBoard
                        columns={columns}
                        visible={visible}
                        canDrag={() => isAdmin}
                        onMove={(task, drop) => void moveTask(task.task_uuid, projectId, drop, statusPatch(drop.column, statusOpts))}
                    />
                </div>
            </div>
            {isAdmin && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
        </div>
    )
}
