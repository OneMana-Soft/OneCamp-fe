import { displayNameOf } from "@/lib/personName"
import React, { useEffect, useRef, useState } from "react";
import { ProjectInfoListRawInterface } from "@/types/project";
import { UserProfileDataInterface } from "@/types/user";
import { priorities } from "@/types/table";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useDispatch, useSelector } from "react-redux";
import { usePost } from "@/hooks/usePost";
import { RootState } from "@/store/store";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import type { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { useForm, Controller, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateTaskFormData,
  createTaskFormSchema,
  CreateTaskInterface,
  TaskInfoInterface,
} from "@/types/task";
import { useTaskUpdate } from "@/hooks/useTaskUpdate";
import {
  clearCreateTaskInputState,
  deleteCreateTaskDialogPreviewFiles,
  removeCreateTaskUploadedFiles,
} from "@/store/slice/createTaskDailogSlice";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { QuietEditor } from "@/components/task/QuietEditor";
import { cn } from "@/lib/utils/helpers/cn";
import { CalendarDays, ChevronDown, GitBranch, MoreHorizontal, Paperclip, Tag, Timer, X } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { ProjectTile } from "@/components/ui/graphics/ProjectTile";
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs";
import { Switch } from "@/components/ui/switch";
import { PriorityMenuContent, StatusMenuContent, menuSurface } from "@/components/task/StatusMenu";
import { statusKindOf } from "@/components/task/taskStatusCell";
import { priorityLevel } from "@/components/task/taskPriorityCell";
import { useProjectStatuses } from "@/hooks/useProjectStatuses";
import { splitTags } from "@/lib/tags";
import { formatDuration, parseDuration } from "@/lib/tasks/time";
import { app_task_path } from "@/types/paths";
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon";
import { shortDate } from "@/lib/utils/date/shortDate";
import { Calendar } from "@/components/ui/calendar";
import type { TaskDraft } from "@/lib/task/messageToTask";
import { lastTaskProject, rememberTaskProject, startingProject } from "@/lib/task/startingProject";
import { myTaskAssignee } from "@/lib/task/myTaskAssignee";

type TaskCreateFormProps = {
  submitLabel?: string;
  onSuccess?: () => void;
  /** Starting name and description, e.g. drafted from a message. */
  prefill?: TaskDraft;
  /** Called with the new task once the server has made it. */
  onCreated?: (task: { taskUUID: string; name: string }) => void;
  /** Shown under the name, e.g. a suggested name; `use` puts one in the field. */
  renderNameHint?: (current: string, use: (name: string) => void) => React.ReactNode;
  /** Assign the task to the person making it, once a project they're in is picked. */
  assignToMe?: boolean;
  /** The project to start with, e.g. the one the person is looking at. */
  defaultProjectId?: string;
};

const TaskCreateForm: React.FC<TaskCreateFormProps> = ({ submitLabel = "Create task", onSuccess, prefill, onCreated, renderNameHint, assignToMe, defaultProjectId }) => {
  const [popOpenProjectName, setPopOpenProjectName] = useState(false);
  const [popOpenUserName, setPopOpenUserName] = useState(false);
  const [popOpenPriority, setPopOpenPriority] = useState(false);
  const [popOpenStatus, setPopOpenStatus] = useState(false);
  const [popOpenDue, setPopOpenDue] = useState(false);
  const [popOpenLabels, setPopOpenLabels] = useState(false);
  const [popOpenEstimate, setPopOpenEstimate] = useState(false);
  const [popOpenMore, setPopOpenMore] = useState(false);
  const [popOpenGitHub, setPopOpenGitHub] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null);
  // What the form holds beyond the schema: the status it starts in, and an
  // estimate, set once the task exists (its own endpoint).
  const [status, setStatus] = useState("todo");
  const [estimate, setEstimate] = useState("");
  // "Create more" keeps the dialog and its chips for the next task (W36).
  const [createMore, setCreateMore] = useState(false);
  const [created, setCreated] = useState<{ taskUUID: string; name: string } | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  
  const uploadFile = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const post = usePost();
  
  // We only read initial state from Redux if needed, but we stop syncing every keystroke back to Redux
  const dialogInputState = useSelector((state: RootState) => state.createTaskDialog.dialogInputState);
  const projectsInfo = useFetch<ProjectInfoListRawInterface>(GetEndpointUrl.projectListByAdminUID);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    getValues,
    watch,
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskFormSchema),
    mode: "onChange",
    defaultValues: {
      task_name: prefill?.name ?? "",
      task_assignee_uuid: "",
      task_description: prefill?.description ?? "",
      task_project_uuid: defaultProjectId ?? "",
      task_attachments: [],
      task_due_date: undefined,
      task_start_date: undefined,
      task_label: "",
      task_priority: "medium",
    },
  });

  const taskProjectUUID = watch("task_project_uuid");
  const taskAssigneeUUID = watch("task_assignee_uuid");

  // The project picked, as the latest list has it: its name, and its members
  // for the assignee picker. A copy kept in state stayed as an older list had
  // it (SWR shows its cached answer while it asks again).
  const projectChoices = projectsInfo.data?.data
  const selectedProject = projectChoices?.find((p) => p.project_uuid === taskProjectUUID) ?? null

  // From My Tasks a task is yours, or it would vanish from the list you made
  // it in. Applied once a project you belong to is picked; you can change it.
  // The rule is myTaskAssignee, which a pick that finishes Create also applies.
  const self = useFetchOnlyOnce<UserProfileInterface>(assignToMe ? GetEndpointUrl.SelfProfile : "");
  const selfUUID = self.data?.data?.user_uuid;
  useEffect(() => {
    if (!taskProjectUUID) return;
    const project = projectsInfo.data?.data.find((p) => p.project_uuid === taskProjectUUID);
    const assignee = myTaskAssignee({ assignToMe, selfUUID, assignee: taskAssigneeUUID, project });
    if (assignee && assignee !== taskAssigneeUUID) {
      setValue("task_assignee_uuid", assignee, { shouldValidate: true });
    }
  }, [assignToMe, selfUUID, taskAssigneeUUID, taskProjectUUID, projectsInfo.data, setValue]);

  // Opened from outside a project, start where the task most likely goes: the
  // project a task was last made in here, or the only one there is. That pick
  // can come from an older list, so when the list that comes back no longer
  // has the project picked (deleted, or no longer one you run), it's picked
  // again the same way. The caller's project stays: the list holds only the
  // projects you run.
  useEffect(() => {
    if (!projectChoices) return
    const gone = !!taskProjectUUID && taskProjectUUID !== defaultProjectId && !projectChoices.some((p) => p.project_uuid === taskProjectUUID)
    if (taskProjectUUID && !gone) return
    const start = startingProject(projectChoices, lastTaskProject())
    if (start || gone) setValue("task_project_uuid", start, { shouldValidate: !!start })
  }, [projectChoices, taskProjectUUID, defaultProjectId, setValue]);

  // Uploads live in Redux (for their progress), keyed by the project picked in
  // this form; copy the finished ones into the form so they are sent with the
  // task. This read a projectUUID field nothing ever set, so every file
  // attached while creating a task was uploaded and then silently dropped.
  const uploadedForProject = taskProjectUUID ? dialogInputState.filesUploaded[taskProjectUUID] : undefined;
  useEffect(() => {
    if (!taskProjectUUID) return;
    const attachments = (uploadedForProject || []).map(file => ({
      attachment_file_name: file.attachment_file_name,
      attachment_obj_key: file.attachment_obj_key,
      attachment_uuid: "",
      attachment_type: file.attachment_type,
      attachment_size: 0,
      attachment_created_at: new Date().toISOString(),
    }));
    setValue("task_attachments", attachments);
  }, [uploadedForProject, taskProjectUUID, setValue]);

  useEffect(() => {
    if (
      selectedProject &&
      taskAssigneeUUID &&
      (!selectedUser || selectedUser.user_uuid !== taskAssigneeUUID)
    ) {
      const user = selectedProject.project_members.find(member => member.user_uuid === taskAssigneeUUID);
      setSelectedUser(user || null);
    }
  }, [selectedProject, taskAssigneeUUID, selectedUser]);


  const handleFileUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      // We need a project UUID to upload files. 
      // If the user hasn't selected a project yet, we can't upload.
      if (!files?.length || !taskProjectUUID) return;

      await uploadFile.makeRequestToUploadToCreateTask(files, taskProjectUUID);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [taskProjectUUID, uploadFile]
  );

  const removePreviewFile = (key: string) => {
    if (!taskProjectUUID) return;
    
    dispatch(
      deleteCreateTaskDialogPreviewFiles({
        key,
        projectUUID: taskProjectUUID,
      })
    );
    dispatch(
      removeCreateTaskUploadedFiles({
        key,
        projectUUID: taskProjectUUID,
      })
    );
  };

  const { optimisticCreateTask, revalidateTaskKeys } = useTaskUpdate();

  const handleCreateTask = async (data: CreateTaskFormData) => {
    const tempTask: TaskInfoInterface = ({
      task_uuid: `temp-${Date.now()}`,
      task_name: data.task_name,
      task_status: status,
      task_priority: data.task_priority || "medium", // Default priority
      task_project: { project_uuid: data.task_project_uuid } as any,
      task_assignee: data.task_assignee_uuid ? { user_uuid: data.task_assignee_uuid } as any : undefined,
      task_due_date: data.task_due_date ? data.task_due_date.toISOString() : "",
      task_start_date: data.task_start_date ? data.task_start_date.toISOString() : "",
      task_label: data.task_label || "",
      task_created_at: new Date().toISOString(),
      task_sub_tasks: [],
      task_comments: [],
      task_attachments: data.task_attachments || [],
    } as unknown) as TaskInfoInterface;

    optimisticCreateTask(tempTask, data.task_project_uuid);

        post
      .makeRequest<CreateTaskInterface, { task_uuid?: string }>({
        apiEndpoint: PostEndpointUrl.CreateTask,
        showToast: true,
        payload: {
          task_name: data.task_name,
          task_assignee_uuid: data.task_assignee_uuid,
          task_description: data.task_description,
          task_project_uuid: data.task_project_uuid,
          task_attachments: data.task_attachments || [],
          task_label: data.task_label,
          task_priority: data.task_priority,
          task_due_date: data.task_due_date ? data.task_due_date.toISOString() : undefined,
          task_start_date: data.task_start_date ? data.task_start_date.toISOString() : undefined,
          task_github_issue_url: data.task_github_issue_url || undefined,
          task_status: status,
        },
      })
      .then((res) => {
        dispatch(clearCreateTaskInputState());
        revalidateTaskKeys(data.task_project_uuid);
        rememberTaskProject(data.task_project_uuid);
        if (res?.task_uuid && onCreated) onCreated({ taskUUID: res.task_uuid, name: data.task_name });
        // An estimate has its own endpoint: set once the task exists.
        const minutes = estimateMinutes(estimate);
        if (res?.task_uuid && minutes) {
          void post
            .makeRequest({ apiEndpoint: PostEndpointUrl.UpdateTaskEstimate, payload: { task_uuid: res.task_uuid, task_estimate_minutes: minutes } })
            .catch(() => undefined);
        }
        if (createMore) {
          // The title and description clear, the chips keep their values, and
          // focus goes back to the title for the next one.
          setValue("task_name", "", { shouldValidate: false });
          setValue("task_description", "");
          setDescriptionKey((k) => k + 1);
          setCreated(res?.task_uuid ? { taskUUID: res.task_uuid, name: data.task_name } : null);
          titleRef.current?.focus();
          return;
        }
        if (onSuccess) onSuccess();
      });
  };

  // Create, pressed with the project all that's missing, opens the picker,
  // and then a pick there is the answer it asked for: it finishes the create,
  // so Create isn't pressed twice. Closing the picker without a pick drops it,
  // and a pick in the picker opened by hand only picks.
  const createOnPick = useRef(false);
  const submitCreate = handleSubmit(handleCreateTask, (invalid: FieldErrors<CreateTaskFormData>) => {
    // The GitHub link sits behind an icon: a mistake in it opens it.
    if (invalid.task_github_issue_url) setPopOpenGitHub(true);
    if (invalid.task_project_uuid && Object.keys(invalid).length === 1) {
      createOnPick.current = true;
      setPopOpenProjectName(true);
    }
  });
  const onProjectPickerOpenChange = (open: boolean) => {
    if (!open) createOnPick.current = false;
    setPopOpenProjectName(open);
  };
  const onProjectPicked = (projectUUID: string) => {
    if (!createOnPick.current) return;
    createOnPick.current = false;
    // From My Tasks the task must go out as yours. The effect that makes it
    // yours runs once this pick has rendered, after the request has left
    // with nobody on it, and the task would not be on the list it was made in.
    const assignee = myTaskAssignee({
      assignToMe,
      selfUUID,
      assignee: getValues("task_assignee_uuid"),
      project: projectChoices?.find((p) => p.project_uuid === projectUUID),
    });
    if (assignee) setValue("task_assignee_uuid", assignee, { shouldValidate: true });
    void submitCreate();
  };

  const startDateWatch = watch("task_start_date");
  const dueDateWatch = watch("task_due_date");
  const nameWatch = watch("task_name") ?? "";
  const labelWatch = watch("task_label") ?? "";
  const priorityWatch = watch("task_priority");
  const githubWatch = watch("task_github_issue_url");

  const needsProject = !selectedProject;
  const pickProjectFirst = needsProject ? "Pick a project first" : undefined;
  const { options: statusOpts } = useProjectStatuses(taskProjectUUID || undefined);
  const statusOption = statusOpts.find((o) => o.value === status) ?? statusOpts.find((o) => o.value === "todo");
  const [descriptionKey, setDescriptionKey] = useState(0);
  // The "Created · Open" line under the chips goes after three seconds.
  useEffect(() => {
    if (!created) return;
    const t = setTimeout(() => setCreated(null), 3000);
    return () => clearTimeout(t);
  }, [created]);

  // The chips' keys (W36, as Linear's): S, P, A, D, L and E open their
  // pickers, while focus is on the dialog rather than in the title or the
  // description. Cmd or Ctrl and Enter creates from anywhere in it.
  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submitCreate();
      return;
    }
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, [contenteditable='true'], [role='dialog'] [cmdk-root]")) return;
    const open: Record<string, () => void> = {
      s: () => setPopOpenStatus(true),
      p: () => setPopOpenPriority(true),
      a: () => !needsProject && setPopOpenUserName(true),
      d: () => setPopOpenDue(true),
      l: () => setPopOpenLabels(true),
      e: () => setPopOpenEstimate(true),
    };
    const fn = open[e.key.toLowerCase()];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const titleField = register("task_name");
  const tags = splitTags(labelWatch);
  const estimateText = estimateMinutes(estimate) ? formatDuration(estimateMinutes(estimate)! * 60) : "";

  return (
    <div data-create-task="">
      {/* A composer, not a form (design v3, W36): the title and description
          fill it, and the properties are chips in one row. Create is never a
          dead end: pressed with only the project missing, it opens the
          project picker, and the pick there finishes the create. */}
      <form onSubmit={submitCreate} onKeyDown={onKeyDown} className="flex flex-col">
        {/* The top bar: the project chip, then where this is. */}
        <div className="flex h-11 items-center gap-1.5 pl-3 pr-12">
          {projectsInfo.data?.data ? (
            <Controller
              control={control}
              name="task_project_uuid"
              render={({ field }) => (
                <Popover open={popOpenProjectName} onOpenChange={onProjectPickerOpenChange}>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(chip, "h-7 pr-1.5", !selectedProject && "text-ink-3")} aria-label={selectedProject ? `Project: ${selectedProject.project_name}` : "Pick a project"}>
                      {selectedProject ? (
                        <>
                          <ProjectTile id={selectedProject.project_uuid} size={16} />
                          <span className="max-w-[16rem] truncate text-foreground">{selectedProject.project_name}</span>
                        </>
                      ) : (
                        <>Pick a project</>
                      )}
                      <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={menuSurface} side="bottom" align="start" portalled={false}>
                    <Command>
                      <CommandInput placeholder="Select project…" className="h-8" />
                      <CommandList>
                        <CommandEmpty>No project found</CommandEmpty>
                        <CommandGroup className="p-0">
                          {projectsInfo.data?.data.map((project) => (
                            <CommandItem
                              key={project.project_uuid}
                              value={project.project_uuid}
                              keywords={[project.project_name, project.project_team.team_name]}
                              className="h-[30px] gap-2 rounded-md"
                              onSelect={(value) => {
                                field.onChange(value);
                                setPopOpenProjectName(false);
                                onProjectPicked(value);
                              }}
                            >
                              <ProjectTile id={project.project_uuid} size={16} />
                              <span className="truncate">{project.project_name}</span>
                              <span className="ml-auto truncate pl-2 text-meta text-ink-3">{project.project_team.team_name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            />
          ) : (
            <span className="text-ui-sm text-ink-3">Loading your projects…</span>
          )}
          <span className="truncate text-ui-sm text-ink-3">› {submitLabel === "Create task" ? "New task" : submitLabel}</span>
        </div>

        {/* The title: borderless, 20/28 590. */}
        <input
          {...titleField}
          ref={(el) => {
            titleField.ref(el);
            titleRef.current = el;
          }}
          id="task_name"
          aria-label="Task title"
          placeholder="Task title"
          autoComplete="off"
          autoFocus
          className="w-full bg-transparent px-4 py-1 text-title-2 text-foreground outline-none placeholder:text-ink-4"
        />
        {renderNameHint && <div className="px-4">{renderNameHint(nameWatch, (name) => setValue("task_name", name, { shouldValidate: true, shouldDirty: true }))}</div>}

        {/* The description: borderless, growing to 320px, then scrolling. */}
        <Controller
          control={control}
          name="task_description"
          render={({ field }) => (
            <QuietEditor
              key={descriptionKey}
              value={field.value}
              placeholder="Add description…"
              onFiles={async (files) => {
                if (!files?.length || !taskProjectUUID) return;
                await uploadFile.makeRequestToUploadToCreateTask(files as unknown as FileList, taskProjectUUID);
              }}
              className="px-4"
              contentClassName="max-h-80 min-h-[72px] overflow-auto text-body"
              onChange={(html) => field.onChange(html)}
            />
          )}
        />

        {/* The property chips (W36): each opens its picker; keys S P A D L E. */}
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2 no-scrollbar sm:flex-wrap" data-create-chips="">
          <Popover open={popOpenStatus} onOpenChange={setPopOpenStatus}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(chip, status !== "todo" && "text-foreground")} aria-label={`Status: ${statusOption?.label ?? "To do"}`} aria-keyshortcuts="S">
                {statusOption ? <StatusGlyph status={statusKindOf(statusOption)} hue={statusOption.hue} size={14} /> : null}
                {statusOption?.label ?? "To do"}
              </button>
            </PopoverTrigger>
            <PopoverContent className={menuSurface} align="start" portalled={false}>
              <StatusMenuContent
                options={statusOpts}
                current={status}
                onSelect={(v) => {
                  setStatus(v);
                  setPopOpenStatus(false);
                }}
              />
            </PopoverContent>
          </Popover>

          <Controller
            control={control}
            name="task_priority"
            render={({ field }) => (
              <Popover open={popOpenPriority} onOpenChange={setPopOpenPriority}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn(chip, priorityWatch && "text-foreground")} aria-label={`Priority: ${priorities.find((p) => p.value === field.value)?.label ?? "No priority"}`} aria-keyshortcuts="P">
                    <PriorityGlyph level={priorityLevel(field.value)} size={14} />
                    {priorities.find((p) => p.value === field.value)?.label ?? "Priority"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className={menuSurface} align="start" portalled={false}>
                  <PriorityMenuContent
                    current={field.value}
                    onSelect={(v) => {
                      field.onChange(v);
                      setPopOpenPriority(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          />

          <Controller
            control={control}
            name="task_assignee_uuid"
            render={({ field }) => (
              <Popover open={popOpenUserName} onOpenChange={setPopOpenUserName}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={needsProject}
                    title={pickProjectFirst}
                    aria-label={selectedUser ? `Assignee: ${displayNameOf(selectedUser)}` : "Pick someone"}
                    aria-keyshortcuts="A"
                    className={cn(chip, selectedUser && "text-foreground")}
                  >
                    {selectedUser ? (
                      <IdentityMark variant="avatar" id={selectedUser.user_uuid} label={displayNameOf(selectedUser)} size={18} />
                    ) : (
                      <span aria-hidden className="size-3.5 rounded-full border border-dashed border-line-3" />
                    )}
                    {selectedUser ? displayNameOf(selectedUser) : "Assignee"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className={menuSurface} side="bottom" align="start" portalled={false}>
                  <Command>
                    <CommandInput placeholder="Select member" className="h-8" />
                    <CommandList>
                      <CommandEmpty>No member found</CommandEmpty>
                      <CommandGroup className="p-0">
                        {(selectedProject?.project_members ?? []).map((member) => (
                          <CommandItem
                            key={member.user_uuid}
                            value={member.user_uuid}
                            className="h-[30px] gap-2 rounded-md"
                            onSelect={(value) => {
                              field.onChange(value);
                              setPopOpenUserName(false);
                            }}
                          >
                            <IdentityMark variant="avatar" id={member.user_uuid} label={displayNameOf(member)} size={18} />
                            <span>{displayNameOf(member)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          />

          <Controller
            control={control}
            name="task_due_date"
            render={({ field }) => (
              <Popover open={popOpenDue} onOpenChange={setPopOpenDue}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn(chip, dueDateWatch && "text-foreground")} aria-label={dueDateWatch ? `Due date: ${shortDate(dueDateWatch)}` : "Due date"} aria-keyshortcuts="D">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {dueDateWatch ? shortDate(dueDateWatch) : "Due date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto rounded-lg p-0 shadow-e3" align="start" portalled={false}>
                  <DayPicker
                    value={field.value ?? undefined}
                    onPick={(d) => {
                      field.onChange(d);
                      setPopOpenDue(false);
                    }}
                    clearLabel="Clear due date"
                  />
                </PopoverContent>
              </Popover>
            )}
          />
          {dueDateWatch && (
            <button type="button" aria-label="Clear due date" className={cn(chip, "px-1.5")} onClick={() => setValue("task_due_date", undefined)}>
              <X className="size-3" />
            </button>
          )}

          <Popover open={popOpenLabels} onOpenChange={setPopOpenLabels}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(chip, tags.length > 0 && "text-foreground")} aria-label={tags.length ? `Labels: ${tags.join(", ")}` : "Labels"} aria-keyshortcuts="L">
                <Tag className="size-3.5" aria-hidden />
                {tags.length ? (tags.length > 2 ? `${tags.slice(0, 2).join(", ")} +${tags.length - 2}` : tags.join(", ")) : "Labels"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 rounded-lg p-3 shadow-e3" align="start" portalled={false}>
              <label htmlFor="task_label" className="mb-1.5 block text-meta font-[510] text-ink-3">
                Labels
              </label>
              <Input id="task_label" {...register("task_label")} placeholder="frontend, needs review" autoComplete="off" className="h-8" />
              <p className="mt-1.5 text-meta text-ink-3">Separate them with commas.</p>
            </PopoverContent>
          </Popover>

          <Popover open={popOpenEstimate} onOpenChange={setPopOpenEstimate}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(chip, estimateText && "text-foreground")} aria-label={estimateText ? `Estimate: ${estimateText}` : "Estimate"} aria-keyshortcuts="E">
                <Timer className="size-3.5" aria-hidden />
                {estimateText || "Estimate"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 rounded-lg p-3 shadow-e3" align="start" portalled={false}>
              <label htmlFor="task_estimate" className="mb-1.5 block text-meta font-[510] text-ink-3">
                How long will it take?
              </label>
              <Input
                id="task_estimate"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    setPopOpenEstimate(false);
                  }
                }}
                placeholder="2h 30m"
                autoComplete="off"
                className="h-8 tabular-nums"
                aria-invalid={estimate.trim() !== "" && !estimateMinutes(estimate)}
              />
            </PopoverContent>
          </Popover>

          {/* The rest: the start date. */}
          <Popover open={popOpenMore} onOpenChange={setPopOpenMore}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(chip, "px-2", startDateWatch && "text-foreground")} aria-label={startDateWatch ? `Start date: ${shortDate(startDateWatch)}` : "Start date and more"}>
                {startDateWatch ? (
                  <>
                    <CalendarDays className="size-3.5" aria-hidden />
                    From {shortDate(startDateWatch)}
                  </>
                ) : (
                  <MoreHorizontal className="size-4" aria-hidden />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-lg p-0 shadow-e3" align="start" portalled={false}>
              <p className="px-3 pt-2.5 text-meta font-[510] text-ink-3">Start date</p>
              <Controller
                control={control}
                name="task_start_date"
                render={({ field }) => (
                  <DayPicker
                    value={field.value ?? undefined}
                    onPick={(d) => {
                      field.onChange(d);
                      setPopOpenMore(false);
                    }}
                    clearLabel="Clear start date"
                  />
                )}
              />
            </PopoverContent>
          </Popover>
          {startDateWatch && (
            <button type="button" aria-label="Clear start date" className={cn(chip, "px-1.5")} onClick={() => setValue("task_start_date", undefined)}>
              <X className="size-3" />
            </button>
          )}
        </div>

        {selectedProject && (dialogInputState.filePreview[selectedProject.project_uuid]?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {dialogInputState.filePreview[selectedProject.project_uuid]?.map((file, index) => (
              <div key={index} className="relative flex items-center gap-2 rounded-md bg-raised p-1.5 pr-3 shadow-e1">
                <button aria-label={`Remove ${file.fileName}`} type="button" className="absolute -right-1.5 -top-1.5 rounded-full bg-pop p-0.5 shadow-e1" onClick={() => removePreviewFile(file.key)}>
                  <X className="size-3" />
                </button>
                <FileTypeIcon name={file.fileName} fileType={file.attachmentType} />
                <div className="min-w-0">
                  <div className="max-w-40 truncate text-meta">{file.fileName}</div>
                  <div className="text-meta text-ink-3">Uploading {file.progress}%</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* What went wrong, in one place above the foot. */}
        {(errors.task_name || errors.task_project_uuid || errors.task_github_issue_url || errors.task_label || errors.task_description) && (
          <div className="grid gap-0.5 px-4 pb-2" role="alert">
            {[errors.task_name, errors.task_project_uuid, errors.task_github_issue_url, errors.task_label, errors.task_description].map((e, i) =>
              e ? (
                <p key={i} className="text-ui-sm text-danger-ink">
                  {e.message}
                </p>
              ) : null,
            )}
          </div>
        )}
        {created && (
          <p className="px-4 pb-2 text-ui-sm text-success-ink [animation:work-rise-in_180ms_var(--ease-out)_both]" role="status">
            Created &ldquo;{created.name}&rdquo; ·{" "}
            <a href={`${app_task_path}/${created.taskUUID}`} className="font-[510] underline-offset-2 hover:underline">
              Open
            </a>
          </p>
        )}

        {/* The foot: attach and GitHub on the left; Create more and Create on the right. */}
        <div className="flex h-[52px] items-center gap-1 border-t border-line pl-3 pr-3">
          {/* Files go to the project, so they wait for one. */}
          <Button type="button" variant="ghost" size="icon" className="size-8 text-ink-3 hover:text-foreground" disabled={needsProject} title={pickProjectFirst ?? "Attach a file"} aria-label="Attach a file" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="size-4" aria-hidden />
          </Button>
          <Popover open={popOpenGitHub} onOpenChange={setPopOpenGitHub}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className={cn("size-8 text-ink-3 hover:text-foreground", (githubWatch || errors.task_github_issue_url) && "text-foreground")} aria-label="Link a GitHub issue or pull request">
                <GitBranch className="size-4" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent forceMount className={cn("w-80 rounded-lg p-3 shadow-e3", !popOpenGitHub && "hidden")} align="start" side="top" portalled={false}>
              <label htmlFor="github-url" className="mb-1.5 block text-meta font-[510] text-ink-3">
                GitHub issue or pull request (optional)
              </label>
              <Controller
                control={control}
                name="task_github_issue_url"
                render={({ field }) => (
                  <Input
                    id="github-url"
                    ref={field.ref}
                    placeholder="https://github.com/owner/repo/issues/123"
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value || undefined)}
                    onBlur={field.onBlur}
                    aria-invalid={!!errors.task_github_issue_url}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="url"
                    className="h-8"
                  />
                )}
              />
            </PopoverContent>
          </Popover>
          <Input
            type="file"
            key={selectedProject ? (dialogInputState.filePreview[selectedProject.project_uuid]?.length || 0) : 0}
            id="file-upload"
            multiple
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            tabIndex={-1}
            aria-hidden
          />
          <span className="flex-1" />
          <label className="mr-2 flex items-center gap-2 text-ui-sm text-ink-2">
            <Switch checked={createMore} onCheckedChange={setCreateMore} aria-label="Create more" />
            <span className="hidden sm:inline">Create more</span>
          </label>
          <Button type="submit" size="sm" disabled={post.isSubmitting} className="gap-2">
            {submitLabel}
            <span className="kbd hidden h-4 min-w-0 border-0 bg-white/20 px-1 text-[inherit] shadow-none sm:inline-flex" aria-hidden>
              ⌘↵
            </span>
          </Button>
        </div>
      </form>
    </div>
  );
};

/** A property chip (W36): 28px, r8, raised with e1, 13/510 ink-2; ink once it has a value. */
const chip =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-raised px-2.5 text-ui-sm font-[510] text-ink-2 shadow-e1 transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** "2h 30m" in minutes, or null when it isn't one (a bare number is hours). */
function estimateMinutes(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return parseDuration(/^\d+(\.\d+)?$/.test(t) ? `${t}h` : t, 1000 * 60);
}

/** A day picker with the quick days (W29): Today, Tomorrow, Next week, then the calendar. */
function DayPicker({ value, onPick, clearLabel }: { value?: Date; onPick: (d: Date | undefined) => void; clearLabel: string }) {
  const day = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-line p-2">
        {[
          ["Today", 0],
          ["Tomorrow", 1],
          ["Next week", 7],
        ].map(([label, n]) => (
          <button key={label} type="button" className="chip h-6 cursor-pointer hover:bg-press hover:text-foreground" onClick={() => onPick(day(n as number))}>
            {label}
          </button>
        ))}
        {value && (
          <button type="button" className="chip h-6 cursor-pointer hover:bg-press hover:text-foreground" onClick={() => onPick(undefined)} aria-label={clearLabel}>
            No date
          </button>
        )}
      </div>
      <Calendar
        mode="single"
        selected={value}
        onSelect={(d) => onPick(d)}
        initialFocus
        className="p-3"
        classNames={{
          day_today: "ring-[1.5px] ring-inset ring-brand font-[510] text-foreground",
          day_selected: "bg-brand text-brand-foreground hover:bg-brand hover:text-brand-foreground focus:bg-brand focus:text-brand-foreground",
        }}
      />
    </div>
  );
};

export default TaskCreateForm;



