import { taskStatusLabel } from "@/types/task"
import {
    ArrowDownIcon,
    ArrowRightIcon,
    ArrowUpIcon,
    CheckCircledIcon,
    CircleIcon,
    CrossCircledIcon,
    QuestionMarkCircledIcon,
    StopwatchIcon,
} from "@radix-ui/react-icons";
import { IconProps } from "@radix-ui/react-icons/dist/types";
import {CircleEllipsis} from "lucide-react";

export interface prioritiesInterface {
    label: string;
    value: string;
    icon: React.ForwardRefExoticComponent<
        IconProps & React.RefAttributes<SVGSVGElement>
    >;
    color: string
}


export const taskStatuses = [
    {
        value: "backlog",
        label: taskStatusLabel("backlog"),
        icon: QuestionMarkCircledIcon,
        color: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    },
    {
        value: "todo",
        label: taskStatusLabel("todo"),
        icon: CircleIcon,
        color: "bg-slate-500/10 text-slate-700 dark:text-slate-300"
    },
    {
        value: "inProgress",
        label: taskStatusLabel("inProgress"),
        icon: StopwatchIcon,
        color: "bg-blue-500/10 text-blue-700 dark:text-blue-300"
    },
    {
        value: "inReview",
        label: taskStatusLabel("inReview"),
        icon: CircleEllipsis,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    },
    {
        value: "done",
        label: taskStatusLabel("done"),
        icon: CheckCircledIcon,
        color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    },
    {
        value: "canceled",
        label: taskStatusLabel("canceled"),
        icon: CrossCircledIcon,
        color: "bg-rose-500/10 text-rose-700 dark:text-rose-300"
    },
];

export const priorities = [
    {
        label: "Low",
        value: "low",
        icon: ArrowDownIcon,
        color: "bg-sky-500/10 text-sky-700 dark:text-sky-300"
    },
    {
        label: "Medium",
        value: "medium",
        icon: ArrowRightIcon,
        color: "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    },
    {
        label: "High",
        value: "high",
        icon: ArrowUpIcon,
        color: "bg-rose-500/10 text-rose-700 dark:text-rose-300"
    },
];

export type ColumnId = 'task_name' | 'task_status' | 'task_priority' | 'task_project_name' | 'task_start_date' | 'task_due_date' | 'task_created_at' | 'task_assignee_name';

export const colName: Record<ColumnId, string> = {
    task_name: "title",
    task_status: "status",
    task_priority: "priority",
    task_project_name: "project",
    task_start_date: "start date",
    task_due_date: "due date",
    task_created_at: "created at",
    task_assignee_name: "assignee"
};
