// A new task's form (components/task/taskCreateForm). Kept out of
// types/task so the types, which the first screen reads, don't bring Zod
// with them (fluid-15).

import { z } from "zod"
import { nameSchema } from "@/lib/validation/names"
import type { AttachmentMediaReq } from "@/types/attachment"

export const createTaskFormSchema = z.object({
  // A title, as a doc's is (lib/validation/names): "Bug" and "SEO" were
  // refused here at under four characters while quick add took them (PTC-11).
  task_name: nameSchema("title", "Task name"),
  task_assignee_uuid: z
    .string()
    .optional(),
  task_description: z
    .string()
    .optional(),
  task_project_uuid: z
    .string()
    .min(1, "Pick a project for the task."),
  task_attachments: z
    .array(z.custom<AttachmentMediaReq>())
    .optional(),
  task_due_date: z
    .date({ message: "Please select a valid due date" })
    .optional(),
  task_start_date: z
    .date({ message: "Please select a valid start date" })
    .optional(),
  task_label: z
    .string()
    .trim()
    .optional(),
  task_priority: z
    .string()
    .min(1, "Please select a priority")
    .optional(),
  task_github_issue_url: z
    .string()
    .url("Must be a valid GitHub URL")
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/\d+$/, "Must be a GitHub issue or PR URL")
    .optional()
    .or(z.literal("")),
});

export type CreateTaskFormData = z.infer<typeof createTaskFormSchema>;
