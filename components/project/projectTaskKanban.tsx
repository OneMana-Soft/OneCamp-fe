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
import { usePost } from "@/hooks/usePost"
import { useReassignTask } from "@/hooks/useReassignTask"
import { useClosedLimit, withQuery } from "@/hooks/useClosedLimit"
import { useStoredState } from "@/hooks/useStoredState"
import { NO_ASSIGNEE, groupByAssignee, type BoardGrouping } from "@/lib/board/groupBy"
import { taskStatusLabel } from "@/types/task"
import { PostEndpointUrl } from "@/services/endPoints"

const EMPTY: TaskInfoInterface[] = []

export const ProjectTaskKanban = ({ projectId = "" }: { projectId?: string }) => {
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const moveTask = useMoveTask()
    const reassign = useReassignTask()
    // Status columns, or one column per person (Linear's "group by assignee").
    const [grouping, setGrouping] = useStoredState<BoardGrouping>(
        projectId ? `oc_board_grouping:${projectId}` : undefined,
        "status",
        (v): v is BoardGrouping => v === "status" || v === "assignee",
    )

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
    const closed = useClosedLimit()
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId ? withQuery(`${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}`, urlParam, closed.param) : "",
    )
    const p = projectInfo.data?.data
    const post = usePost()
    // "Add task" in a column: a task in that column's status (built-in or the
    // project's own), then the board reloads to show it in place.
    const quickAdd = async (column: string, name: string) => {
        // On a board of people the column is who it is for; otherwise its status.
        const payload =
            grouping === "assignee"
                ? { task_name: name, task_project_uuid: projectId, task_status: "todo", task_assignee_uuid: column === NO_ASSIGNEE ? "" : column }
                : { task_name: name, task_project_uuid: projectId, task_status: column }
        const res = await post.makeRequest<typeof payload, { task_uuid?: string }>({
            apiEndpoint: PostEndpointUrl.CreateTask,
            payload,
            showErrorToast: true,
        })
        if (!res) return false
        await projectInfo.mutate()
        return true
    }
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
    const byPerson = useMemo(() => (grouping === "assignee" ? groupByAssignee(columns, p?.project_members) : null), [grouping, columns, p?.project_members])

    return (
        <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex mb-4 justify-between">
                <div className="flex space-x-2">
                    <ProjectTaskKanbanAssigneeFilter activeList={assigneeFilter} updateList={setAssigneeFilter} members={p?.project_members} />
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter} />
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex" onClick={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}>
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
                            <DropdownMenuLabel>Group by</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(["status", "assignee"] as const).map((g) => (
                                <DropdownMenuCheckboxItem key={g} checked={grouping === g} onCheckedChange={() => setGrouping(g)}>
                                    {g === "status" ? "Status" : "Assignee"}
                                </DropdownMenuCheckboxItem>
                            ))}
                            <DropdownMenuSeparator />
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
                    {byPerson ? (
                        <TaskBoard
                            columns={byPerson.columns}
                            visible={byPerson.options}
                            canDrag={() => isAdmin}
                            onMove={(task, drop) => {
                                if (drop.column === (task.task_assignee?.user_uuid || NO_ASSIGNEE)) return
                                const to = drop.column === NO_ASSIGNEE ? null : p?.project_members?.find((m) => m.user_uuid === drop.column) ?? null
                                void reassign(task.task_uuid, projectId, to)
                            }}
                            boardKey={`project:${projectId}:assignee`}
                            onQuickAdd={isAdmin ? quickAdd : undefined}
                            badgeFor={(task) => task.task_custom_status_name || taskStatusLabel(task.task_status)}
                        />
                    ) : (
                        <TaskBoard
                            columns={columns}
                            visible={visible}
                            canDrag={() => isAdmin}
                            onMove={(task, drop) => void moveTask(task.task_uuid, projectId, drop, statusPatch(drop.column, statusOpts))}
                            boardKey={`project:${projectId}`}
                            totals={{ done: p?.project_tasks_done_count, canceled: p?.project_tasks_canceled_count }}
                            onShowMore={closed.showMore}
                            onQuickAdd={isAdmin ? quickAdd : undefined}
                        />
                    )}
                </div>
            </div>
            {isAdmin && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
        </div>
    )
}
