import { displayNameOf } from "@/lib/personName"
import { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import { priorities } from "@/types/table";
import { isClosedStatus, statusValueOf, statusOptionOf, type StatusOption } from "@/lib/taskStatus";
import { shortDate } from "@/lib/utils/date/shortDate";
import { GitBranch, MessageSquare } from "@/lib/icons";
import {prioritiesInterface} from "@/types/table";
import {TaskTableColumnHeader} from "@/components/task/taskTableColumnHeader";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {TaskInfoInterface} from "@/types/task";
import {TaskAssigneeCell} from "@/components/task/taskAssigneeCell";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {useDispatch} from "react-redux";
import { BlockedBadge } from "@/components/task/BlockedBadge"
import { FieldValueView } from "@/components/task/fieldValue"
import type { TaskField } from "@/lib/tasks/fields"



/** statusOptions: the project's statuses, so its own ones show in their
 * colours; fields: its custom fields, a column each; nameOf names a person
 * field's value. */
export const useProjectTaskColumn = (statusOptions?: StatusOption[], fields: TaskField[] = [], nameOf?: (id: string) => string | undefined) => {

    const { t } = useTranslation();
    const dispatch = useDispatch();
    const columns: ColumnDef<TaskInfoInterface>[] = [

        {
            accessorKey: "task_name",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("title")} />
            ),
            cell: ({ row }) => {
                const label = row.original.task_label;

                return (
                    <div className="flex space-x-2 group flex-wrap hover:cursor-pointer"
                         onClick={()=>{
                             dispatch(openRightPanel({
                                 channelUUID: "",
                                 chatMessageUUID: "",
                                 chatUUID: "",
                                 postUUID: "",
                                 taskUUID: row.original.task_uuid,
                                 groupUUID: "",
                                 docUUID: ""}))
                             // openTaskInfo(row.original.task_uuid)
                         }}
                    >
                        {label && <Badge variant="secondary">{label}</Badge>}
                        <span
                            className="max-w-[500px] truncate font-medium group-hover:underline task-name mr-2"
                            title={row.getValue("task_name") as string}
                        >
            {row.getValue("task_name")}
          </span>
                        <BlockedBadge count={row.original.task_blocked_open} />
                        {row.original.task_comment_count && <span className='text-muted-foreground '>{row.original.task_comment_count}<MessageSquare className='h-3 w-3 inline ml-1'/></span>}
                        {row.original.task_sub_task_count && <span className='text-muted-foreground '>{row.original.task_sub_task_count}<GitBranch className='h-3 w-3 inline ml-1'/></span>}

                    </div>
                );
            },
            enableSorting: false,
        },
        {
            accessorKey: "task_status",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("status")} />
            ),
            cell: ({ row }) => {
                // Its custom status, or its built-in one (see lib/taskStatus).
                const status = statusOptionOf(row.original, statusOptions);

                if (!status) {
                    return null;
                }

                return (
                    <div className="flex w-full items-center hover: cursor-pointer" onClick={()=>{
                        dispatch(openRightPanel({
                            channelUUID: "",
                            chatMessageUUID: "",
                            chatUUID: "",
                            postUUID: "",
                            taskUUID: row.original.task_uuid,
                            groupUUID: "",
                            docUUID: ""}))
                        // openTaskInfo(row.original.task_uuid)
                    }} >
                       <TaskStatusCell status={status}/>
                    </div>
                );
            },
            filterFn: (row, _id, value) => {
                return value.includes(statusValueOf(row.original));
            },
            enableSorting: false,
        },
        {
            accessorKey: "task_priority",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("priority")} />
            ),
            cell: ({ row }) => {
                const priority = priorities.find(
                    (priority: prioritiesInterface) => priority.value === row.getValue("task_priority")
                );

                if (!priority) {
                    return null;
                }

                return (
                    <div className="flex items-center w-full hover:cursor-pointer" onClick={()=>{
                        dispatch(openRightPanel({
                            channelUUID: "",
                            chatMessageUUID: "",
                            chatUUID: "",
                            postUUID: "",
                            taskUUID: row.original.task_uuid,
                            groupUUID: "",
                            docUUID: ""}))

                        // openTaskInfo(row.original.task_uuid)
                    }}>
                        <TaskPriorityCell priority={priority}/>

                    </div>
                );
            },
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            enableSorting: false,
        },
        {
            accessorKey: "task_assignee_name",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("assignee")} />
            ),
            cell: ({ row }) => (

                <>{row.original?.task_assignee && displayNameOf(row.original.task_assignee) ? <div className="flex space-x-2 group cursor-pointer" onClick={()=>{
                    // store.dispatch(openOtherUserProfilePopup({userId:row.original?.task_assignee?.user_uuid || ''}))
                }}>
        <TaskAssigneeCell userInfo={row.original?.task_assignee}/>
                    </div>:
                    null}</>
            ),
            enableSorting: false,
            filterFn: (row,_, filterValue) => {
                return  filterValue.includes(row.original.task_assignee?.uid);
            },
        },
        {
            accessorKey: "task_start_date",
            meta: { align: "right" },
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("startDate")} />
            ),
            cell: ({ row }) =>{

                const d = new Date(row.getValue("task_start_date"))
                return (
                    <div className="flex w-full cursor-pointer justify-end text-xs tabular-nums text-muted-foreground" onClick={()=>{
                        dispatch(openRightPanel({
                            channelUUID: "",
                            chatMessageUUID: "",
                            chatUUID: "",
                            postUUID: "",
                            taskUUID: row.original.task_uuid,
                            groupUUID: "",
                            docUUID: ""}))

                        // openTaskInfo(row.original.task_uuid)
                    }}>
        <div className=" truncate">
          {!isZeroEpoch(row.getValue("task_start_date")) ? shortDate(d):""}
        </div>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "task_due_date",
            meta: { align: "right" },
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("dueDate")} />
            ),
            cell: ({ row }) => {
                const d = new Date(row.getValue("task_due_date"))
                return (
                    <div className="flex w-full cursor-pointer justify-end text-xs tabular-nums text-muted-foreground" onClick={()=>{
                        dispatch(openRightPanel({
                            channelUUID: "",
                            chatMessageUUID: "",
                            chatUUID: "",
                            postUUID: "",
                            taskUUID: row.original.task_uuid,
                            groupUUID: "",
                            docUUID: ""}))

                        // openTaskInfo(row.original.task_uuid)
                    }}>

                        <span className={`${
            d < new Date() && !isZeroEpoch(row.getValue("task_due_date")) && !isClosedStatus(row.getValue("task_status") as string) ? 'text-danger-ink' : ''
        } `}>
          {!isZeroEpoch(row.getValue("task_due_date")) ? shortDate(d) : ""}
        </span>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "task_created_at",
            meta: { align: "right" },
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={t("createdDate")} />
            ),
            cell: ({ row }) => {
                const d = new Date(row.getValue("task_created_at"))
                return (
                    <div className="flex w-full cursor-pointer justify-end text-xs tabular-nums text-muted-foreground" onClick={()=>{
                        dispatch(openRightPanel({
                            channelUUID: "",
                            chatMessageUUID: "",
                            chatUUID: "",
                            postUUID: "",
                            taskUUID: row.original.task_uuid,
                            groupUUID: "",
                            docUUID: ""}))

                        // openTaskInfo(row.original.task_uuid)
                    }}>
        <span >
          {!isZeroEpoch(row.getValue("task_created_at")) ? shortDate(d) : ""}
        </span>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        // A column for each of the project's own fields. Its id is the field's
        // filter id, so a filter set on it goes to the server, which applies it
        // (business/TaskField); values aren't sorted on.
        ...fields.map((f): ColumnDef<TaskInfoInterface> => ({
            id: f.filter_id,
            meta: { label: f.name, ...(f.type === "money" || f.type === "number" ? { align: "right" } : {}) },
            accessorFn: (row) => row.task_fields?.[f.id],
            header: ({ column }) => <TaskTableColumnHeader column={column} title={f.name} />,
            cell: ({ row }) => <FieldValueView field={f} value={row.original.task_fields?.[f.id]} nameOf={nameOf} className="max-w-[14rem]" />,
            enableSorting: false,
            filterFn: () => true,
        })),
        // Never shown: carries the cycle filter (see business/Cycle), which the
        // server applies, so every row it returns passes here.
        {
            id: "task_cycle",
            accessorFn: () => "",
            header: () => null,
            cell: () => null,
            enableHiding: false,
            enableSorting: false,
            filterFn: () => true,
        },
        // Uncomment if needed
        // {
        //   id: "actions",
        //   cell: ({ row }) => <DataTableRowActions row={row} />,
        // },
    ];


    return {
        columns
    };
};
