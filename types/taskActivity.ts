type TaskActivityKey = {
    key: string;
};

export const taskActivityConst: Record<string, TaskActivityKey> = {
    "nameUpdate": {
        "key": "updatedTask",
    },
    "labelUpdate": {
        "key": "updatedTaskLabel",
    },
    "statusUpdate": {
        "key": "updatedTaskStatus",
    },
    "priorityUpdate": {
        "key": "updateTaskPriority",
    },
    "assigneeUpdate": {
        "key": "updateTaskAssignee",
    },
    "startDateUpdate": {
        "key": "updateTaskStartDate",
    },
    "endDateUpdate": {
        "key": "updatedTaskDueDate",
    },
    "descUpdate": {
        "key": "updatedTaskDesc",
    },
    "attachmentAdd": {
        "key": "addedTaskAttachment",
    },
    "attachmentRemove": {
        "key": "removedAttachment",
    },
    "dependencyAdd": {
        "key": "addedTaskDependency",
    },
    "dependencyRemove": {
        "key": "removedTaskDependency",
    },
    "estimate": {
        "key": "updatedTaskEstimate",
    },
    // A task's points on its project's scale (linear-05): an estimate too.
    "points": {
        "key": "updatedTaskEstimate",
    },
    // A custom field's value: the activity's next state names the field.
    "fieldUpdate": {
        "key": "updatedTaskField",
    },
    // Its type (A8K): the next state names the type it has now.
    "typeUpdate": {
        "key": "updatedTaskType",
    },
    "subTaskAdd": {
        "key": "createSubTask",
    },
    "subTaskDelete": {
        "key": "subTaskDelete",
    },
    "subTaskUnDelete": {
        "key": "subTaskUnDelete",
    },
    "commentAdd": {
        "key": "addedCommentToTask",
    },
    "commentUpdate": {
        "key": "updatedTaskComment",
    },
    "commentDelete": {
        "key": "deletedTaskComment",
    },
    "taskDelete": {
        "key": "deletedTask",
    },
    "taskUnDelete": {
        "key": "unrelatedTask",
    },
    // Its own words: "createTask" is the button's ("Create task").
    "taskCreate": {
        "key": "activityCreatedTask",
    }
};
