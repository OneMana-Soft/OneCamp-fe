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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import MinimalTiptapTask from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { Content } from "@tiptap/react";
import { Paperclip, X } from "@/lib/icons";
import { fieldLabel, fieldRow, inlineAdd, inlineAffordance, inlineInput, inlineValue } from "@/lib/ui/fieldRow";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { Calendar as CalenderIcon } from "lucide-react";
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon";
import { shortDate } from "@/lib/utils/date/shortDate";
import { Calendar } from "@/components/ui/calendar";
import { DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { useMedia } from "@/context/MediaQueryContext";
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

/**
 * DateField — reusable date picker for the task-create form.
 *
 * Why it exists as a real component instead of inline render={() => ...}:
 * react-hook-form's <Controller render>'s render callback runs during
 * the parent's render but *not* as a React component, so calling
 * `useState` / `useMedia` inside it is a Rules-of-Hooks violation. The
 * symptom is intermittent — works in dev because the callback re-runs
 * on every parent render, breaks in prod when React's rules-of-hooks
 * checker swaps hook positions between desktop/mobile transitions.
 *
 * Hoisting the picker into a real subcomponent that takes `field` as a
 * prop fixes the violation. Identical UX, identical styling.
 */
type DateFieldProps = {
  field: {
    value?: Date | null;
    onChange: (value: Date | undefined) => void;
  };
  placeholder: string;
  drawerTitle: string;
};

const DateField: React.FC<DateFieldProps> = ({ field, placeholder, drawerTitle }) => {
  const { isMobile } = useMedia();
  const [open, setOpen] = useState(false);

  const Trigger = (
    <Button
      type="button"
      variant="ghost"
      className={cn(inlineValue, "tabular-nums", !field.value && "text-muted-foreground")}
    >
      {field.value ? shortDate(field.value) : <span>{placeholder}</span>}
      <CalenderIcon aria-hidden className={cn(inlineAffordance, "h-3.5 w-3.5")} />
    </Button>
  );

  const Content = (
    <Calendar
      mode="single"
      selected={field.value ?? undefined}
      onSelect={(date) => {
        field.onChange(date);
        if (isMobile) setOpen(false);
      }}
      initialFocus
      className={cn("p-3", isMobile && "w-full flex justify-center")}
      classNames={
        isMobile
          ? {
              months: "w-full flex flex-col space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 w-full",
              table: "w-full border-collapse space-y-1",
              head_row: "flex w-full justify-between",
              row: "flex w-full mt-2 justify-between",
              cell: "text-center flex-1 p-0 relative focus-within:relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
              head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
              day: "h-9 w-full p-0 font-normal aria-selected:opacity-100",
            }
          : undefined
      }
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{Trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle className="sr-only">{drawerTitle}</DrawerTitle>
          <div className="mt-4 border-t pt-4 pb-4 flex flex-col items-center">{Content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" portalled={false}>
        {Content}
      </PopoverContent>
    </Popover>
  );
};

const TaskCreateForm: React.FC<TaskCreateFormProps> = ({ submitLabel = "Create task", onSuccess, prefill, onCreated, renderNameHint, assignToMe, defaultProjectId }) => {
  const [popOpenProjectName, setPopOpenProjectName] = useState(false);
  const [popOpenUserName, setPopOpenUserName] = useState(false);
  const [popOpenPriority, setPopOpenPriority] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null);
  
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
      task_status: "todo", // Default status
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
        },
      })
      .then((res) => {
        dispatch(clearCreateTaskInputState());
        revalidateTaskKeys(data.task_project_uuid);
        rememberTaskProject(data.task_project_uuid);
        if (res?.task_uuid && onCreated) onCreated({ taskUUID: res.task_uuid, name: data.task_name });
        if (onSuccess) onSuccess();
      });
  };

  // Create, pressed with the project all that's missing, opens the picker,
  // and then a pick there is the answer it asked for: it finishes the create,
  // so Create isn't pressed twice. Closing the picker without a pick drops it,
  // and a pick in the picker opened by hand only picks.
  const createOnPick = useRef(false);
  const submitCreate = handleSubmit(handleCreateTask, (invalid: FieldErrors<CreateTaskFormData>) => {
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

  const needsProject = !selectedProject;
  const pickProjectFirst = needsProject ? "Pick a project first" : undefined;

  return (
    <div>
      {/* Create is never a dead end: pressed without a project, it says so and
          opens the picker, where a disabled button gave no reason at all, and
          the project picked there finishes the create. Only when the project
          is all that's missing: with another field wrong, focus goes to that
          field, and the picker would open and shut again.

          Laid out as the task panel is: a label column and values that read
          as text and open to edit. Every row is there from the start (those
          that need a project say so until there is one), so the dialog no
          longer grows by a third when a project is picked. */}
      <form onSubmit={submitCreate} className="grid gap-5 pt-1">
        <div className="grid gap-2">
          <Label htmlFor="task_name">Name</Label>
          <Input id="task_name" {...register("task_name")} placeholder="e.g. Review the pricing page…" autoComplete="off" autoFocus />
          {renderNameHint?.(watch("task_name") ?? "", (name) => setValue("task_name", name, { shouldValidate: true, shouldDirty: true }))}
          {errors.task_name && <p className="text-danger-ink text-sm" role="alert">{errors.task_name.message}</p>}
        </div>

        <div className="grid">
          <div className={fieldRow()}>
            <span className={fieldLabel}>Project</span>
            <div className="min-w-0">
              {projectsInfo.data?.data ? (
                <Controller
                  control={control}
                  name="task_project_uuid"
                  render={({ field }) => (
                    <Popover open={popOpenProjectName} onOpenChange={onProjectPickerOpenChange}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" className={cn(inlineValue, !selectedProject && "text-muted-foreground")}>
                          {selectedProject ? (
                            <>
                              <IdentityMark id={selectedProject.project_uuid} variant="square" />
                              <span className="truncate">{selectedProject.project_name}</span>
                              <span className="truncate text-muted-foreground">{selectedProject.project_team.team_name}</span>
                            </>
                          ) : (
                            <>Pick a project</>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" side="bottom" align="start" portalled={false}>
                        <Command>
                          <CommandInput placeholder="Select project…" />
                          <CommandList>
                            <CommandEmpty>No project found</CommandEmpty>
                            <CommandGroup>
                              {projectsInfo.data?.data.map(project => (
                                <CommandItem
                                  key={project.project_uuid}
                                  value={project.project_uuid}
                                  keywords={[project.project_name, project.project_team.team_name]}
                                  onSelect={(value) => {
                                    field.onChange(value);
                                    setPopOpenProjectName(false);
                                    onProjectPicked(value);
                                  }}
                                >
                                  <IdentityMark id={project.project_uuid} variant="square" />
                                  <span className="truncate">{project.project_name}</span>
                                  <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{project.project_team.team_name}</span>
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
                <span className="text-sm text-muted-foreground">Loading your projects…</span>
              )}
              {errors.task_project_uuid && <p className="text-danger-ink text-sm" role="alert">{errors.task_project_uuid.message}</p>}
            </div>
          </div>

          <div className={fieldRow()}>
            <span className={fieldLabel}>Assignee</span>
            <div className="min-w-0">
              <Controller
                control={control}
                name="task_assignee_uuid"
                render={({ field }) => (
                  <Popover open={popOpenUserName} onOpenChange={setPopOpenUserName}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" disabled={needsProject} title={pickProjectFirst} className={cn(inlineValue, !selectedUser && "text-muted-foreground")}>
                        {selectedUser ? <>{displayNameOf(selectedUser)}</> : <>Pick someone</>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" side="bottom" align="start" portalled={false}>
                      <Command>
                        <CommandInput placeholder="Select member" />
                        <CommandList>
                          <CommandEmpty>No member found</CommandEmpty>
                          <CommandGroup>
                            {(selectedProject?.project_members ?? []).map(member => (
                              <CommandItem
                                key={member.user_uuid}
                                value={member.user_uuid}
                                onSelect={(value) => {
                                  field.onChange(value);
                                  setPopOpenUserName(false);
                                }}
                              >
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
              {errors.task_assignee_uuid && <p className="text-danger-ink text-sm" role="alert">{errors.task_assignee_uuid.message}</p>}
            </div>
          </div>

          <div className={fieldRow()}>
            <span className={fieldLabel}>Priority</span>
            <div className="min-w-0">
              <Controller
                control={control}
                name="task_priority"
                render={({ field }) => (
                  <Popover open={popOpenPriority} onOpenChange={setPopOpenPriority}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" className={inlineValue}>
                        {(() => {
                          const p = priorities.find(p => p.value === field.value);
                          return p ? (
                            <>
                              <p.icon className="h-4 w-4 text-muted-foreground" />
                              {p.label}
                            </>
                          ) : (
                            <span className="text-muted-foreground">Pick a priority</span>
                          );
                        })()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" side="bottom" align="start" portalled={false}>
                      <Command>
                        <CommandInput placeholder="Select priority" />
                        <CommandList>
                          <CommandEmpty>No priority found</CommandEmpty>
                          <CommandGroup>
                            {priorities.map(member => (
                              <CommandItem
                                key={member.value}
                                value={member.value}
                                onSelect={(value) => {
                                  field.onChange(value);
                                  setPopOpenPriority(false);
                                }}
                              >
                                <member.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span>{member.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
            </div>
          </div>

          <div className={fieldRow()}>
            <span className={fieldLabel}>Dates</span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3">
              <div className="flex items-center">
                <Controller
                  control={control}
                  name="task_start_date"
                  render={({ field }) => <DateField field={field} placeholder="Start date" drawerTitle="Start date" />}
                />
                {startDateWatch && (
                  <Button type="button" aria-label="Clear start date" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setValue("task_start_date", undefined)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <span aria-hidden className="text-muted-foreground">to</span>
              <div className="flex items-center">
                <Controller
                  control={control}
                  name="task_due_date"
                  render={({ field }) => <DateField field={field} placeholder="Due date" drawerTitle="Due date" />}
                />
                {dueDateWatch && (
                  <Button type="button" aria-label="Clear due date" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setValue("task_due_date", undefined)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            {errors.task_start_date && <p className="text-danger-ink text-sm" role="alert">{errors.task_start_date.message}</p>}
            {errors.task_due_date && <p className="text-danger-ink text-sm" role="alert">{errors.task_due_date.message}</p>}
          </div>

          <div className={fieldRow()}>
            <Label htmlFor="task_label" className={fieldLabel}>Tags</Label>
            <div className="min-w-0">
              <Input id="task_label" {...register("task_label")} placeholder="e.g. frontend, needs review…" autoComplete="off" className={cn(inlineInput, "w-full")} />
              {errors.task_label && <p className="text-danger-ink text-sm" role="alert">{errors.task_label.message}</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Controller
            control={control}
            name="task_description"
            render={({ field }) => (
                <MinimalTiptapTask
                    throttleDelay={3000}
                    toggleToolbar
                    onActionFiles={async (files) => {
                        if (!files?.length || !taskProjectUUID) return;
                        await uploadFile.makeRequestToUploadToCreateTask(files as unknown as FileList, taskProjectUUID);
                    }}
                    className={cn("max-w-full rounded-lg h-auto border p-2 bg-muted/30")}
                    editorContentClassName="overflow-auto h-full min-h-[5rem]"
                    output="html"
                    content={field.value}
                    placeholder="Add details…"
                    editable={true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={(content: Content) => {
                        field.onChange(content?.toString() || "");
                    }}
                />
            )}
          />
          {errors.task_description && <p className="text-danger-ink text-sm" role="alert">{errors.task_description.message}</p>}
        </div>

        <div className="grid gap-1">
          <Label htmlFor="github-url">GitHub issue or pull request (optional)</Label>
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
              />
            )}
          />
          {errors.task_github_issue_url && <p className="text-danger-ink text-sm" role="alert">{errors.task_github_issue_url.message}</p>}
        </div>

        {selectedProject && (dialogInputState.filePreview[selectedProject.project_uuid]?.length ?? 0) > 0 && (
          <div className="flex flex-wrap">
            {dialogInputState.filePreview[selectedProject.project_uuid]?.map((file, index) => (
              <div key={index} className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-lg border-border">
                <button aria-label={`Remove ${file.fileName}`} type="button" className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-border border" onClick={() => removePreviewFile(file.key)}>
                  <X height="1rem" width="1rem" />
                </button>
                <div>
                  <FileTypeIcon name={file.fileName} fileType={file.attachmentType} />
                </div>
                <div className="flex-col">
                  <div className="text-ellipsis truncate max-w-40 text-xs">{file.fileName}</div>
                  <div className="text-ellipsis truncate max-w-40 text-xs">Uploading: {file.progress}%</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row items-center sm:justify-between">
          {/* Files go to the project, so they wait for one. */}
          <Button type="button" variant="ghost" size="sm" className={inlineAdd} disabled={needsProject} title={pickProjectFirst} onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            Attach a file
          </Button>
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
          <Button type="submit" disabled={post.isSubmitting}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
};

export default TaskCreateForm;



