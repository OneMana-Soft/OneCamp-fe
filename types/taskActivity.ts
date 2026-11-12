/** The phrase key for each kind of change in a task's history. */
export const taskActivityConst: Record<string, string> = {
  nameUpdate: "updatedTask",
  labelUpdate: "updatedTaskLabel",
  statusUpdate: "updatedTaskStatus",
  priorityUpdate: "updateTaskPriority",
  assigneeUpdate: "updateTaskAssignee",
  startDateUpdate: "updateTaskStartDate",
  endDateUpdate: "updatedTaskDueDate",
  descUpdate: "updatedTaskDesc",
  attachmentAdd: "addedTaskAttachment",
  attachmentRemove: "removedAttachment",
  dependencyAdd: "addedTaskDependency",
  dependencyRemove: "removedTaskDependency",
  estimate: "updatedTaskEstimate",
  // A task's points on its project's scale (linear-05): an estimate too.
  points: "updatedTaskEstimate",
  // A custom field's value: the activity's next state names the field.
  fieldUpdate: "updatedTaskField",
  // Its type (A8K): the next state names the type it has now.
  typeUpdate: "updatedTaskType",
  subTaskAdd: "createSubTask",
  subTaskDelete: "subTaskDelete",
  subTaskUnDelete: "subTaskUnDelete",
  commentAdd: "addedCommentToTask",
  commentUpdate: "updatedTaskComment",
  commentDelete: "deletedTaskComment",
  taskDelete: "deletedTask",
  taskUnDelete: "unrelatedTask",
  // Its own words: "createTask" is the button's ("Create task").
  taskCreate: "activityCreatedTask",
}
