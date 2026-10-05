import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CirclePlus } from "lucide-react"
import { useDispatch } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import type { UserInfoRawInterface } from "@/types/user"
import type { TaskInfoInterface } from "@/types/task"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import { TaskKanbanColumnPriorityFilter } from "@/components/task/taskKanbanColumnPriorityFilter"
import { TaskKanbanProjectFilter } from "@/components/task/taskKanbanProjectFilter"
import { openUI } from "@/store/slice/uiSlice"
import { taskStatuses } from "@/types/table"
import { useMoveTask } from "@/hooks/useMoveTask"
import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { BUILT_IN_STATUSES, statusPatch } from "@/lib/taskStatus"
import { TaskBoard } from "@/components/kanbanComponents/TaskBoard"

const EMPTY: TaskInfoInterface[] = []

/** My Tasks as a board: the tasks assigned to me across projects. */
export const MyTaskKanban = () => {
    const { t } = useTranslation()
    const dispatch = useDispatch()
    const moveTask = useMoveTask()

    const [activeProject, setActiveProject] = useState<string[]>([])
    const [priorityFilter, setPriorityFilter] = useState<string[]>([])
    const [viewableStatus, setColumnShown] = useBoardColumns({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false,
    })

    // The priority filter used to be left out of this request, so choosing a
    // priority on My Tasks changed nothing.
    const urlParam = GetTaskStatusQueryParamByStatus({ projectFilter: activeProject, priorityFilter })
    const userInfo = useFetch<UserInfoRawInterface>(
        urlParam ? `${GetEndpointUrl.GetUserTaskListForKanban}?${urlParam}` : GetEndpointUrl.GetUserTaskListForKanban,
    )
    const u = userInfo.data?.data

    const columns = useMemo(
        () => ({
            backlog: u?.user_tasks_backlog ?? EMPTY,
            todo: u?.user_tasks_todo ?? EMPTY,
            inProgress: u?.user_tasks_in_progress ?? EMPTY,
            inReview: u?.user_tasks_in_review ?? EMPTY,
            done: u?.user_tasks_done ?? EMPTY,
            canceled: u?.user_tasks_canceled ?? EMPTY,
        }),
        [u],
    )
    // Across projects, so only the built-in columns: a task in one of its
    // project's own statuses sits in that status's category and says which.
    const visible = useMemo(() => BUILT_IN_STATUSES.filter((o) => isShown(viewableStatus, o.value)), [viewableStatus])

    return (
        <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex mb-4 justify-between">
                <div className="flex space-x-2">
                    <TaskKanbanProjectFilter activeList={activeProject} updateList={setActiveProject} />
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter} />
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex" onClick={() => dispatch(openUI({ key: "createTask", data: { assignToMe: true } }))}>
                        <CirclePlus className="h-4 w-4" /> {t("createTask")}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
                                <MixerHorizontalIcon className="mr-2 h-4 w-4" />
                                {t("view")}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[150px]">
                            <DropdownMenuLabel>{t("toggleColumns")}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {taskStatuses.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.value}
                                    className="capitalize"
                                    checked={isShown(viewableStatus, column.value)}
                                    onCheckedChange={(value) => setColumnShown(column.value, value)}
                                >
                                    {column.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="flex-1 overflow-hidden mt-2">
                <div className="h-full">
                    <TaskBoard
                        columns={columns}
                        visible={visible}
                        // Only in projects where I am an admin: the server allows no more.
                        canDrag={(task) => Boolean(task.task_project?.project_is_admin)}
                        onMove={(task, drop) => void moveTask(task.task_uuid, task.task_project.project_uuid, drop, statusPatch(drop.column, BUILT_IN_STATUSES))}
                    />
                </div>
            </div>
        </div>
    )
}
