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
import { useForm, Controller } from "react-hook-form";
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
import { X } from "@/lib/icons";
import { Calendar as CalenderIcon } from "lucide-react";
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { useMedia } from "@/context/MediaQueryContext";
import type { TaskDraft } from "@/lib/task/messageToTask";
import { lastTaskProject, rememberTaskProject, startingProject } from "@/lib/task/startingProject";

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
      variant="outline"
      className={cn(
        "pl-3 text-left font-normal mt-4",
        !field.value && "text-muted-foreground",
      )}
    >
      {field.value ? format(field.value, "PP") : <span>{placeholder}</span>}
      <CalenderIcon className="ml-2 h-4 w-4" />
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
  const self = useFetchOnlyOnce<UserProfileInterface>(assignToMe ? GetEndpointUrl.SelfProfile : "");
  const selfUUID = self.data?.data?.user_uuid;
  useEffect(() => {
    if (!assignToMe || !selfUUID || taskAssigneeUUID || !taskProjectUUID) return;
    const project = projectsInfo.data?.data.find((p) => p.project_uuid === taskProjectUUID);
    if (project?.project_members?.some((m) => m.user_uuid === selfUUID)) {
      setValue("task_assignee_uuid", selfUUID, { shouldValidate: true });
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

  const startDateWatch = watch("task_start_date");
  const dueDateWatch = watch("task_due_date");

  return (
    <div>
      {/* Create is never a dead end: pressed without a project, it says so and
          opens the picker, where a disabled button gave no reason at all. Only
          when the project is all that's missing: with another field wrong,
          focus goes to that field, and the picker would open and shut again. */}
      <form
        onSubmit={handleSubmit(handleCreateTask, (invalid) => {
          if (invalid.task_project_uuid && Object.keys(invalid).length === 1) setPopOpenProjectName(true);
        })}
        className="grid gap-4 py-4"
      >
        <div className="grid gap-2 mb-2">
          <Label htmlFor="task_name">Name</Label>
          <Input id="task_name" {...register("task_name")} placeholder="Enter task name" autoFocus />
          {renderNameHint?.(watch("task_name") ?? "", (name) => setValue("task_name", name, { shouldValidate: true, shouldDirty: true }))}
          {errors.task_name && <p className="text-destructive text-sm">{errors.task_name.message}</p>}
        </div>
        
        <div className="grid gap-2 mb-2">
          {projectsInfo.data?.data && (
            <div className="flex items-center space-x-4">
              <p className="text-sm">Project</p>
              <Controller
                control={control}
                name="task_project_uuid"
                render={({ field }) => (
                  <Popover open={popOpenProjectName} onOpenChange={setPopOpenProjectName}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start">
                        {selectedProject ? (
                          <>
                            {selectedProject.project_name} {" (" + selectedProject.project_team.team_name + ")"}
                          </>
                        ) : (
                          <>Pick a project</>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" side="bottom" portalled={false}>
                      <Command>
                        <CommandInput placeholder="Select project…" />
                        <CommandList>
                          <CommandEmpty>No project found</CommandEmpty>
                          <CommandGroup>
                            {projectsInfo.data?.data.map(project => (
                              <CommandItem
                                key={project.project_uuid}
                                value={project.project_uuid}
                                onSelect={(value) => {
                                  field.onChange(value);
                                  setPopOpenProjectName(false);
                                }}
                              >
                                <span>
                                  {project.project_name}
                                  <span className="ml-2">{"(" + project.project_team.team_name + ")"}</span>
                                </span>
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
          )}
          {errors.task_project_uuid && <p className="text-destructive text-sm">{errors.task_project_uuid.message}</p>}
          
          {selectedProject && (
            <div className="flex mt-2 flex-wrap gap-x-4 gap-y-4">
              <div className="flex items-center gap-x-4">
                <p className="text-sm">Assignee</p>
                <Controller
                    control={control}
                    name="task_assignee_uuid"
                    render={({ field }) => (
                        <Popover open={popOpenUserName} onOpenChange={setPopOpenUserName}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="justify-start">
                            {selectedUser ? <>{displayNameOf(selectedUser)}</> : <>Pick someone</>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" side="bottom" align="start" portalled={false}>
                            <Command>
                            <CommandInput placeholder="Select member" />
                            <CommandList>
                                <CommandEmpty>No member found</CommandEmpty>
                                <CommandGroup>
                                {selectedProject.project_members.map(member => (
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
              </div>
              {errors.task_assignee_uuid && <p className="text-destructive text-sm">{errors.task_assignee_uuid.message}</p>}
              
              <div className="flex items-center space-x-4">
                <p className="text-sm">Priority</p>
                <Controller
                  control={control}
                  name="task_priority"
                  render={({ field }) => (
                    <Popover open={popOpenPriority} onOpenChange={setPopOpenPriority}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start">
                          {field.value ? (
                            <>
                              {(() => {
                                const p = priorities.find(p => p.value === field.value);
                                return p ? (
                                  <>
                                    <p.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                    {p.label}
                                  </>
                                ) : (
                                  <>Select Priority</>
                                );
                              })()}
                            </>
                          ) : (
                            <>Select Priority</>
                          )}
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
              
              <div className="flex items-center gap-x-4">
                <Label htmlFor="task_label">Tags</Label>
                <Input id="task_label" {...register("task_label")} placeholder="Separate with commas, e.g. frontend, needs review" />
                {errors.task_label && <p className="text-destructive text-sm">{errors.task_label.message}</p>}
              </div>
            </div>
          )}
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Controller
            control={control}
            name="task_description"
            render={({ field }) => (
                <MinimalTiptapTask
                    throttleDelay={3000}
                    onActionFiles={async (files) => {
                        if (!files?.length || !taskProjectUUID) return;
                        await uploadFile.makeRequestToUploadToCreateTask(files as unknown as FileList, taskProjectUUID);
                    }}
                    className={cn("max-w-full rounded-xl h-auto border p-2 bg-secondary/20")}
                    editorContentClassName="overflow-auto h-full"
                    output="html"
                    content={field.value}
                    placeholder="Enter description…"
                    editable={true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={(content: Content) => {
                        field.onChange(content?.toString() || "");
                    }}
                />
            )}
          />
          {errors.task_description && <p className="text-destructive text-sm">{errors.task_description.message}</p>}
        </div>
        
        {selectedProject?.project_uuid && (
          <div>
            <Label htmlFor="file-upload" className="cursor-pointer">
              Attachments
            </Label>
            <Input
              type="file"
              key={(dialogInputState.filePreview[selectedProject.project_uuid]?.length) || 0}
              id="file-upload"
              multiple
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <div className="flex flex-wrap">
              {dialogInputState.filePreview[selectedProject.project_uuid]?.map((file, index) => (
                <div key={index} className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-border">
                  <button aria-label={`Remove ${file.fileName}`} type="button" className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-border border" onClick={() => removePreviewFile(file.key)}>
                    <X height="1rem" width="1rem" />
                  </button>
                  <div>
                    <FileTypeIcon name={file.fileName} fileType={file.attachmentType} />
                  </div>
                  <div className="flex-col">
                    <div className="text-ellipsis truncate max-w-40 text-xs">{file.fileName}</div>
                    <div className="text-ellipsis truncate max-w-40 text-xs">uploading: {file.progress}%</div>
                  </div>
                </div>
              ))}
            </div>
            
            {selectedProject?.project_uuid && (
              <div className="mt-4">
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
                      className="mt-1"
                    />
                  )}
                />
                {errors.task_github_issue_url && <p className="text-destructive text-sm">{errors.task_github_issue_url.message}</p>}
                <p className="text-xs text-muted-foreground mt-1">Link this task to an existing GitHub issue or pull request.</p>
              </div>
            )}

            <div className="flex space-x-8">
              <div className="relative">
                <Controller
                    control={control}
                    name="task_start_date"
                    render={({ field }) => (
                        <DateField
                            field={field}
                            placeholder="Start date"
                            drawerTitle="Select Start Date"
                        />
                    )}
                />
                {startDateWatch && (
                  <Button type="button" aria-label="Clear start date" variant="ghost" size="icon" className="absolute -right-4 top-0 transform rounded-full" onClick={() => setValue("task_start_date", undefined)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {errors.task_start_date && <p className="text-destructive text-sm">{errors.task_start_date.message}</p>}
              
              <div className="relative">
                <Controller
                    control={control}
                    name="task_due_date"
                    render={({ field }) => (
                        <DateField
                            field={field}
                            placeholder="Due date"
                            drawerTitle="Select Due Date"
                        />
                    )}
                />
                {dueDateWatch && (
                  <Button type="button" aria-label="Clear due date" variant="ghost" size="icon" className="absolute -right-4 top-0 transform rounded-full" onClick={() => setValue("task_due_date", undefined)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {errors.task_due_date && <p className="text-destructive text-sm">{errors.task_due_date.message}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" disabled={post.isSubmitting}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
};

export default TaskCreateForm;



