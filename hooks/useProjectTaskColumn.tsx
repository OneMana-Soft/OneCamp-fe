import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";

import { priorities, taskStatuses } from "@/types/table";
import {format} from "date-fns";
import {Calendar, GitBranch, MessageSquare} from "lucide-react";
import {prioritiesInterface} from "@/types/table";
import {TaskTableColumnHeader} from "@/components/task/taskTableColumnHeader";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {TaskInfoInterface} from "@/types/task";
import {TaskAssigneeCell} from "@/components/task/taskAssigneeCell";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {useDispatch} from "react-redux";



export const useProjectTaskColumn = () => {

    const dispatch = useDispatch();
    const columns: ColumnDef<TaskInfoInterface>[] = [

        {
            accessorKey: "task_name",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={("title")} />
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
                        >
            {row.getValue("task_name")}
          </span>
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
                <TaskTableColumnHeader column={column} title={("status")} />
            ),
            cell: ({ row }) => {
                const status = taskStatuses.find(
                    (status: prioritiesInterface) => status.value === row.getValue("task_status")
                );

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
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            enableSorting: false,
        },
        {
            accessorKey: "task_priority",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={("priority")} />
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
                <TaskTableColumnHeader column={column} title={("assignee")} />
            ),
            cell: ({ row }) => (

                <>{row.original?.task_assignee?.user_name ? <div className="flex space-x-2 group cursor-pointer" onClick={()=>{
                    // store.dispatch(openOtherUserProfilePopup({userId:row.original?.task_assignee?.user_uuid || ''}))
                }}>
        <TaskAssigneeCell userInfo={row.original?.task_assignee}/>
                    </div>:
                    <span>{"--"}</span>}</>
            ),
            enableSorting: false,
            filterFn: (row,_, filterValue) => {
                return  filterValue.includes(row.original.task_assignee?.uid);
            },
        },
        {
            accessorKey: "task_start_date",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={("startDate")} />
            ),
            cell: ({ row }) =>{

                const d = new Date(row.getValue("task_start_date"))
                return (
                    <div className="flex space-x-2 w-full hover: cursor-pointer text-xs" onClick={()=>{
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
          {!isZeroEpoch(row.getValue("task_start_date")) ? format(d, "dd MMM yyyy"):"--"}
        </div>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "task_due_date",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={("dueDate")} />
            ),
            cell: ({ row }) => {
                const d = new Date(row.getValue("task_due_date"))
                return (
                    <div className="flex space-x-2 hover: cursor-pointer w-full text-xs" onClick={()=>{
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
            d < new Date() && !isZeroEpoch(row.getValue("task_due_date")) && row.getValue("task_status") != 'done' ? 'text-destructive' : ''
        } `}>
          {!isZeroEpoch(row.getValue("task_due_date")) ? format(d, "dd MMM yyyy") : "--"}
        </span>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "task_created_at",
            header: ({ column }) => (
                <TaskTableColumnHeader column={column} title={("createdDate")} />
            ),
            cell: ({ row }) => {
                const d = new Date(row.getValue("task_created_at"))
                return (
                    <div className="flex space-x-2 hover: cursor-pointer w-full text-xs" onClick={()=>{
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
          {!isZeroEpoch(row.getValue("task_created_at")) ? format(d, "dd MMM yyyy") : "--"}
        </span>
                    </div>
                )},
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
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
