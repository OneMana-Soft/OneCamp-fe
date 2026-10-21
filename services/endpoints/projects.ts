/**
 * The projects area's API endpoints: what only projects code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum ProjectsGet {
    // A project's task statuses: /project/{id}/statuses (+ /reorder, /{statusId}, /{statusId}/delete)
    ProjectStatuses = "/project",
    UserListNotBelongToProjectButBelongsToTeam="user/usersListWhoDontBelongToTheProjectButBelongToTheTeam",
    TeamListUserIsAdmin = "/team/teamListByAdminUID",
    GetProjectMemberInfo = "/project/membersInfo",
    GetProjectAttachments = "/project/attachments",
    GetTaskRecurrence = "/task/recurrence",
    // A project's cycles: /project/{id}/cycles (+ /{cycle}/complete, /rename, /delete)
    ProjectCycles = "/project",
    // A project's intake forms: /project/{id}/forms (+ /{form}/delete)
    ProjectForms = "/project",
    // A project's rules: /project/{id}/rules (+ /{rule}, /active, /delete, /runs, /runs/{run}/undo)
    ProjectRules = "/project",
    // Project templates: GET the list, POST one from a file; /{id} to download,
    // /{id}/delete. A project is saved as one at /project/{id}/save-as-template.
    ProjectTemplates = "/project/templates",
    ProjectSaveAsTemplate = "/project",
    // A project's updates: /project/{id}/updates (?limit=), /updates/draft?tz=,
    // POST /updates, /updates/{update}/edit|delete
    ProjectUpdates = "/project",
    // A project's timeline is /project/{id}/timeline: lib/timelineKey.
    // Every project the reader is in, with where its tasks stand: ?tz=
    ProjectsOverview = "/project/overview",
    ProjectReport = "/project/report",
    // The AI edition's draft of a project's next update (POST {project_uuid, tz}).
    AiProjectUpdateDraft = "/ai/project-update/draft",
    // What a project's time is billed at: GET /project/{id}/rates, POST to
    // set it, /rates/delete to stop billing. The project's admins only.
    ProjectRates = "/project",
    // Goals: GET /goal/list?tz=, POST /goal/create; one goal is /goal/{id}?tz=,
    // with /edit, /delete, /reopen, /projects (+ /{project}/delete),
    // /checkins (+ /draft?tz=, /{checkin}/edit|delete). A project's goals are
    // /project/{id}/goals?tz=.
    GoalList = "/goal/list",
    GoalCreate = "/goal/create",
    Goal = "/goal",
    ProjectGoals = "/project",
    // The AI edition's draft of a goal's next check-in (POST {goal_id, tz}).
    AiGoalCheckInDraft = "/ai/goal-checkin/draft",
    // The AI edition's plan for a project from a sentence: POST {description}
    // starts a draft, GET /{draft_id} reads it until it's done.
    AiProjectPlanDraft = "/ai/project-template/draft",
    GetTaskCycle = "/task/cycle",
    // A client's newest verdict on a task: /task/clientReview/{task}
    TaskClientReview = "/task/clientReview",
    ProjectTime = "/project",
    // append /{projectId}/invoices: a project's saved invoices (business/Invoice)
    ProjectInvoices = "/project",
    GetTaskViews = "/task/views",
    // Templates (shareable templates)
    GetMarketplaceTemplates = "/marketplace/templates", // append ?kind= or /{id}
    // GitHub (Task)
    GetGitHubTaskActivity = "/task/github-activity",
    GetGitHubSearchIssues = "/task/github-search-issues",
    GetGitHubSearchPRs = "/task/github-search-prs",
    // A channel's automatic check-ins: GET/POST /ch/{channel}/checkins; one is
    // /ch/checkins/{id}/edit|pause|delete|ask.
    CheckIns = "/ch",
}

export enum ProjectsPost {
    RecordDocView = "/doc/recordView",
    // Both dates at once, as the timeline moves a task: {task_uuid, task_start_date,
    // task_due_date, shift_dependents, tz}; answers {shifted: [...]}
    UpdateTaskDates = "/task/updateTaskDates",
    // A task waits on another of its project: {task_uuid, blocked_by_uuid}
    AddTaskDependency = "/task/dependency",
    SetWorkloadCapacity = "/project/workload/capacity",
    UpdateTaskEstimate = "/task/updateTaskEstimate",
    SetTaskField = "/task/field",
    RemoveTaskDependency = "/task/dependency/delete",
    SetTaskRecurrence = "/task/recurrence",
    SetTaskCycle = "/task/cycle",
    SaveTaskView = "/task/views",
    DeleteTaskView = "/task/views/delete",
    AIExtractTasks = "/ai/extract-tasks",
    AIExtractTasksCreate = "/ai/extract-tasks/create",
}
