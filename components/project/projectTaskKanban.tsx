import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SlidersHorizontal } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectInfoRawInterface } from "@/types/project"
import { GetEndpointUrl } from "@/services/endPoints"
import { boardQuery } from "@/lib/board/boardQuery"
import type { TaskInfoInterface } from "@/types/task"
import { accessOf, canEditTask } from "@/lib/work/access"
import { mayMoveInto } from "@/lib/board/moveInto"
import { useMyId } from "@/hooks/useMyId"
import { useMoveTask } from "@/hooks/useMoveTask"
import { isShown, useBoardColumns } from "@/hooks/useBoardColumns"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { columnsByStatus, statusPatch, type StatusOption } from "@/lib/taskStatus"
import { getCoreRowModel, useReactTable, type ColumnFiltersState } from "@tanstack/react-table"
import { WorkToolbar } from "@/components/task/WorkToolbar"
import { HiddenColumnsHint } from "@/components/task/HiddenColumnsHint"
import { useProjectTaskColumn } from "@/hooks/useProjectTaskColumn"
import { useDebounce } from "@/hooks/useDebounce"
import dynamic from "next/dynamic"

const ProjectStatusesDialog = dynamic(() => import("@/components/project/ProjectStatusesDialog").then((m) => m.ProjectStatusesDialog), { loading: () => null })
const ProjectFieldsDialog = dynamic(() => import("@/components/project/ProjectFieldsDialog").then((m) => m.ProjectFieldsDialog), { loading: () => null })
import { TaskBoard } from "@/components/kanbanComponents/TaskBoard"
import { closedColumn } from "@/lib/board/columnOrder"
import { useProjectStatusOrder } from "@/hooks/useProjectStatusOrder"
import { useLiveEntity } from "@/lib/liveEntity"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { CardFieldsContext } from "@/components/task/cardFields"
import { useProjectFields, usePeople } from "@/hooks/useProjectFields"
import { KeyboardList } from "@/components/task/KeyboardList"
import { usePost } from "@/hooks/usePost"
import { useTaskFields } from "@/hooks/useTaskFields"
import { useClosedLimit, useOpenLimit, withQuery } from "@/hooks/useClosedLimit"
import { columnPaging } from "@/components/kanbanComponents/TaskBoard"
import { columnTotals } from "@/lib/board/columnTotals"
import { useStoredState } from "@/hooks/useStoredState"
import { NO_ASSIGNEE, groupByAssignee, type BoardGrouping } from "@/lib/board/groupBy"
import { assigneeLanes, priorityLanes, type BoardLanes } from "@/lib/board/lanes"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"
import { priorities } from "@/types/table"
import { cn } from "@/lib/utils/helpers/cn"
import { TagFilter } from "@/components/tags/TagFilter"
import { hasTag } from "@/lib/tags"
import { taskStatusLabel } from "@/types/taskScale"
import { PostEndpointUrl } from "@/services/endPoints"
import { WorkState } from "@/components/task/workFrame"
import { BoardSkeleton } from "@/components/kanbanComponents/BoardSkeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { useProjectHue } from "@/lib/projectHue"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useMedia } from "@/context/MediaQueryContext"
import { app_task_path } from "@/types/paths"

const EMPTY: TaskInfoInterface[] = []

/** A priority's arrow in its own colour, before a lane's label. */
function PriorityMark({ value }: { value: string }) {
    const p = priorities.find((x) => x.value === value)
    if (!p) return null
    return (
        <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-md", p.color)}>
            <p.icon className="h-3.5 w-3.5" />
        </span>
    )
}

export const ProjectTaskKanban = ({ projectId = "", className }: { projectId?: string; className?: string }) => {
    const projectHue = useProjectHue(projectId)
    const moveTask = useMoveTask()
    const { reassign, setPriority } = useTaskFields()
    // Status columns, or one column per person (Linear's "group by assignee").
    const [grouping, setGrouping] = useStoredState<BoardGrouping>(
        projectId ? `oc_board_grouping:${projectId}` : undefined,
        "status",
        (v): v is BoardGrouping => v === "status" || v === "assignee",
    )
    // Rows across the status columns (swimlanes), when grouped by status.
    const [laneBy, setLaneBy] = useStoredState<BoardLanes>(
        projectId ? `oc_board_lanes:${projectId}` : undefined,
        "none",
        (v): v is BoardLanes => v === "none" || v === "assignee" || v === "priority",
    )

    // The toolbar a project's list and board share (WorkToolbar, PTC-6): its
    // filters and its search, kept as the list keeps them, and sent the same
    // way. The board drew chips of its own, with no Filter, Search or Cycle.
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [globalFilter, setGlobalFilter] = useState("")
    const search = useDebounce(globalFilter, 300)
    const [tagFilter, setTagFilter] = useState<string[]>([])
    const [viewableStatus, setColumnShown] = useBoardColumns({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false,
    })

    const urlParam = boardQuery(columnFilters, search)
    const closed = useClosedLimit()
    // Open columns page too (PROJ-BUG-8): their totals, and Show more.
    const open = useOpenLimit()
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId ? withQuery(`${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}`, urlParam, closed.param, open.param) : "",
    )
    const p = projectInfo.data?.data
    const post = usePost()
    // "Add task" in a column: a task in that column's status (built-in or the
    // project's own), then the board reloads to show it in place.
    const quickAdd = async (column: string, name: string, lane?: string) => {
        // On a board of people the column is who it is for; otherwise its
        // status, and a lane adds who has it or its priority.
        const forPerson = (who: string) => (who === NO_ASSIGNEE ? "" : who)
        const payload: { task_name: string; task_project_uuid: string; task_status: string; task_assignee_uuid?: string; task_priority?: string } =
            grouping === "assignee"
                ? { task_name: name, task_project_uuid: projectId, task_status: "todo", task_assignee_uuid: forPerson(column) }
                : { task_name: name, task_project_uuid: projectId, task_status: column }
        if (grouping === "status" && lane !== undefined) {
            if (laneBy === "assignee") payload.task_assignee_uuid = forPerson(lane)
            if (laneBy === "priority") payload.task_priority = lane
        }
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
    // Which tasks the reader changes, adds and how the board is set up are
    // the server's answer (Work Access).
    const me = useMyId()
    const access = accessOf(p)
    // A phone has no panel beside the board: a card opens the task's page,
    // as a row of the Tasks tab does. It dispatched the panel there, which a
    // phone never draws, so a tapped card only took on the opened ring.
    const router = useAppRouter()
    const { isMobile } = useMedia()
    const openOnPhone = useCallback((task: TaskInfoInterface) => router.push(`${app_task_path}/${task.task_uuid}`), [router])
    const onOpen = isMobile ? openOnPhone : undefined

    // One column per status: the built-in ones, each followed by the project's
    // own that count as it (the server groups tasks by category only). Another
    // admin's change to them or their order reaches this board through the
    // app's message router (hooks/useMqttMessageHandler), as it reaches every
    // picker. The connection holds the topic of every project it was made in;
    // the open board takes up the topic of one joined since, for the router.
    const { options: statusOpts, isLoading: statusesLoading } = useProjectStatuses(projectId)
    const setOrder = useProjectStatusOrder(projectId)
    const live = useLiveEntity("project", projectId)
    useMqttTopic({ topic: live.state === "ok" ? live.topic ?? "" : "", onLive: () => void projectInfo.mutate() })
    const [managing, setManaging] = useState(false)
    const [managingFields, setManagingFields] = useState(false)
    // The project's own fields its cards show, and the names for person ones.
    const { fields } = useProjectFields(projectId)
    const { nameOf } = usePeople(projectId, fields)
    const cardFields = useMemo(() => ({ fields: fields.filter((f) => f.on_card), nameOf }), [fields, nameOf])
    // The toolbar's filters live in a table of the board's tasks, with the
    // list's columns, so its field filters find their columns.
    const { columns: taskColumns } = useProjectTaskColumn(statusOpts, fields, nameOf)
    const table = useReactTable({
        data: EMPTY,
        columns: taskColumns,
        state: { columnFilters, globalFilter },
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        manualFiltering: true,
    })
    const allColumns = useMemo(
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
    // The tag filter works on the board as loaded: tasks with any chosen tag.
    const columns = useMemo(() => {
        if (tagFilter.length === 0) return allColumns
        const keep = (t: TaskInfoInterface) => tagFilter.some((tag) => hasTag(t.task_label, tag))
        return Object.fromEntries(Object.entries(allColumns).map(([k, v]) => [k, v.filter(keep)]))
    }, [allColumns, tagFilter])
    const visible = useMemo(() => statusOpts.filter((o) => isShown(viewableStatus, o.value)), [statusOpts, viewableStatus])
    const [hideEmpty, setHideEmpty] = useStoredState<boolean>(
        projectId ? `oc_board_hide_empty:${projectId}` : undefined,
        false,
        (v): v is boolean => typeof v === "boolean",
    )
    const byPerson = useMemo(
        () => (grouping === "assignee" ? groupByAssignee(columns, p?.project_members, hideEmpty) : null),
        [grouping, columns, p?.project_members, hideEmpty],
    )
    const members = p?.project_members
    const lanes = useMemo(() => {
        if (grouping !== "status" || laneBy === "none") return undefined
        if (laneBy === "priority") return priorityLanes(columns, hideEmpty, (id) => <PriorityMark value={id} />)
        return assigneeLanes(columns, members, hideEmpty, (id) => {
            const m = members?.find((x) => x.user_uuid === id)
            return m ? <TaskAssigneeCell userInfo={m} avatarOnly /> : null
        })
    }, [grouping, laneBy, columns, members, hideEmpty])
    const boardTasks = useMemo(() => Object.values(columns).flat(), [columns])
    // The project's column order, which its admins drag (columnDrag): only on
    // a board of status columns, as a board of people has no order to keep.
    // statusOpts are already in the project's order. A move shows at once; if
    // the server says no, the hook puts the order back.
    const columnOrder = useMemo(() => {
        if (!access.manage || grouping !== "status") return undefined
        const closedOf = new Map(statusOpts.map((o) => [o.value, closedColumn(o)]))
        return {
            order: statusOpts.map((o) => o.value),
            closed: (value: string) => closedOf.get(value) ?? false,
            onChange: (order: string[]) => {
                void setOrder(order).catch(() => {
                    // The request layer has said what went wrong.
                })
            },
        }
    }, [access.manage, grouping, statusOpts, setOrder])
    const canEdit = useCallback((t: TaskInfoInterface) => canEditTask(t, me, p), [me, p])
    // Each column's total, and which page a column's Show more asks for:
    // done and cancelled the closed page, every other status the open one.
    const totals = useMemo(
        () => columnTotals(p?.project_column_counts, { done: p?.project_tasks_done_count, canceled: p?.project_tasks_canceled_count }),
        [p?.project_column_counts, p?.project_tasks_done_count, p?.project_tasks_canceled_count],
    )
    const showMore = useCallback(
        (column: string) => (columnPaging(statusOpts.find((o) => o.value === column) ?? { value: column }).closed ? closed.showMore() : open.showMore()),
        [statusOpts, closed, open],
    )
    // The states, where every tab of a project draws them
    // (components/task/workFrame): the board's columns while it loads, a
    // failed load said as such, and a project with no tasks its spot.
    // The statuses' first read too (a small one, made beside the board's): the
    // columns come in the project's order, not the default one and then a jump.
    const loading = (projectInfo.isLoading && !p) || statusesLoading
    const failed = !!projectInfo.isError && !p
    const filtering = columnFilters.length > 0 || !!search.trim() || tagFilter.length > 0
    // The statuses the board hides, said beside its filters (PTC-5).
    const hidden = useMemo(
        () => statusOpts.filter((o) => !isShown(viewableStatus, o.value)).map((o) => ({ value: o.value, label: o.label, count: totals[o.value] ?? allColumns[o.value]?.length })),
        [statusOpts, viewableStatus, totals, allColumns],
    )
    const noTasks =
        !!p &&
        !filtering &&
        Object.values(allColumns).every((list) => list.length === 0) &&
        !p.project_tasks_done_count &&
        !p.project_tasks_canceled_count

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* The toolbar the project's list has (PTC-6): Filter with its
                chips, the fields and the cycle, the board's tags and the
                statuses it hides, search, the board's own Display, New task. */}
            <WorkToolbar
                table={table}
                projectId={projectId}
                canCreate={access.create_tasks}
                extra={
                    <>
                        <TagFilter projectId={projectId} active={tagFilter} onChange={setTagFilter} />
                        {grouping === "status" && <HiddenColumnsHint hidden={hidden} onShow={() => hidden.forEach((c) => setColumnShown(c.value, true))} />}
                    </>
                }
                display={
                    <BoardDisplayMenu
                        grouping={grouping}
                        onGrouping={setGrouping}
                        laneBy={laneBy}
                        onLaneBy={setLaneBy}
                        hideEmpty={hideEmpty}
                        onHideEmpty={setHideEmpty}
                        statusOptions={statusOpts}
                        shown={viewableStatus}
                        onShown={setColumnShown}
                        onManageStatuses={access.manage ? () => setManaging(true) : undefined}
                        onManageFields={access.manage ? () => setManagingFields(true) : undefined}
                    />
                }
            />

            <div className={cn("flex min-h-0 flex-1 flex-col pb-4", className)}>
            {loading ? (
                <div className="min-h-0 flex-1">
                    <BoardSkeleton />
                </div>
            ) : failed ? (
                <WorkState className="px-4 sm:px-0">
                    <ErrorState subject="this project's board" onRetry={() => void projectInfo.mutate()} />
                </WorkState>
            ) : noTasks ? (
                <WorkState className="px-4 sm:px-0">
                    <EmptyState illustration={<SpotTasks hue={projectHue} />} title="No tasks yet" description="Create one and it shows here." />
                </WorkState>
            ) : (
            <KeyboardList tasks={boardTasks} canEdit={canEdit} listProjectId={projectId} statusOptions={statusOpts} placement="overlay" className="flex-1 overflow-hidden">
                <CardFieldsContext.Provider value={cardFields}>
                    <div className="h-full">
                        {byPerson ? (
                            <TaskBoard
                                columns={byPerson.columns}
                                visible={byPerson.options}
                                canDrag={canEdit}
                                onMove={(task, drop) => {
                                    if (drop.column === (task.task_assignee?.user_uuid || NO_ASSIGNEE)) return
                                    const to = drop.column === NO_ASSIGNEE ? null : p?.project_members?.find((m) => m.user_uuid === drop.column) ?? null
                                    void reassign(task.task_uuid, projectId, to)
                                }}
                                boardKey={`project:${projectId}:assignee`}
                                onQuickAdd={access.create_tasks ? quickAdd : undefined}
                                badgeFor={(task) => task.task_custom_status_name || taskStatusLabel(task.task_status)}
                                onOpen={onOpen}
                            />
                        ) : (
                            <TaskBoard
                                columns={columns}
                                visible={visible}
                                canDrag={canEdit}
                                onMove={(task, drop, lane) => {
                                    void moveTask(task.task_uuid, projectId, drop, statusPatch(drop.column, statusOpts))
                                    // Into another row as well: it changes hands, or priority.
                                    if (!lane || lane.from === lane.to) return
                                    if (laneBy === "priority") void setPriority(task.task_uuid, projectId, lane.to)
                                    else void reassign(task.task_uuid, projectId, lane.to === NO_ASSIGNEE ? null : members?.find((m) => m.user_uuid === lane.to) ?? null)
                                }}
                                lanes={lanes}
                                boardKey={`project:${projectId}`}
                                totals={totals}
                                onShowMore={showMore}
                                onQuickAdd={access.create_tasks ? quickAdd : undefined}
                                // None where the column's rule on who leaves the reader out.
                                addsTo={(s) => mayMoveInto(access, s)}
                                onOpen={onOpen}
                                columnOrder={columnOrder}
                            />
                        )}
                    </div>
                </CardFieldsContext.Provider>
            </KeyboardList>
            )}
            </div>
            {access.manage && managing && <ProjectStatusesDialog projectId={projectId} open={managing} onOpenChange={setManaging} />}
            {access.manage && managingFields && <ProjectFieldsDialog projectId={projectId} open={managingFields} onOpenChange={setManagingFields} />}
        </div>
    )
}

/** The board's Display: how it groups, its rows, the columns it shows, and its admins' statuses and fields. */
function BoardDisplayMenu({
    grouping,
    onGrouping,
    laneBy,
    onLaneBy,
    hideEmpty,
    onHideEmpty,
    statusOptions,
    shown,
    onShown,
    onManageStatuses,
    onManageFields,
}: {
    grouping: BoardGrouping
    onGrouping: (g: BoardGrouping) => void
    laneBy: BoardLanes
    onLaneBy: (l: BoardLanes) => void
    hideEmpty: boolean
    onHideEmpty: (v: boolean) => void
    statusOptions: StatusOption[]
    shown: Record<string, boolean>
    onShown: (column: string, shown: boolean) => void
    onManageStatuses?: () => void
    onManageFields?: () => void
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="extend-touch-target text-ui-sm" aria-label="Display">
                    <SlidersHorizontal className="size-3.5" />
                    <span className="hidden sm:inline">Display</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuLabel>Group by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["status", "assignee"] as const).map((g) => (
                    <DropdownMenuCheckboxItem key={g} checked={grouping === g} onCheckedChange={() => onGrouping(g)}>
                        {g === "status" ? "Status" : "Assignee"}
                    </DropdownMenuCheckboxItem>
                ))}
                {grouping === "status" && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Rows</DropdownMenuLabel>
                        {(["none", "assignee", "priority"] as const).map((l) => (
                            <DropdownMenuCheckboxItem key={l} checked={laneBy === l} onCheckedChange={() => onLaneBy(l)}>
                                {l === "none" ? "None" : l === "assignee" ? "Assignee" : "Priority"}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </>
                )}
                {(grouping === "assignee" || laneBy !== "none") && (
                    <DropdownMenuCheckboxItem checked={hideEmpty} onCheckedChange={(v) => onHideEmpty(Boolean(v))}>
                        {grouping === "assignee" || laneBy === "assignee" ? "Hide people with no tasks" : "Hide empty rows"}
                    </DropdownMenuCheckboxItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {statusOptions.map((column) => (
                    <DropdownMenuCheckboxItem
                        key={column.value}
                        className={column.custom ? "pl-10" : undefined}
                        checked={isShown(shown, column.value)}
                        onCheckedChange={(value) => onShown(column.value, value)}
                    >
                        {column.label}
                    </DropdownMenuCheckboxItem>
                ))}
                {onManageStatuses && onManageFields && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onManageStatuses}>Manage statuses…</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onManageFields}>Manage fields…</DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
