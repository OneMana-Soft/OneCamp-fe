import React, { useEffect, useRef, useState } from "react";
import { ProjectInfoInterface, ProjectInfoListRawInterface } from "@/types/project";
import { UserProfileDataInterface } from "@/types/user";
import { priorities, prioritiesInterface } from "@/types/table";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useDispatch, useSelector } from "react-redux";
import { usePost } from "@/hooks/usePost";
import { RootState } from "@/store/store";
import { useFetch } from "@/hooks/useFetch";
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
import { mutate } from "swr";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import MinimalTiptapTask from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { Content } from "@tiptap/react";
import { Calendar as CalenderIcon, X } from "lucide-react";
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { useMedia } from "@/context/MediaQueryContext";

type TaskCreateFormProps = {
  submitLabel?: string;
  onSuccess?: () => void;
};

export const TaskCreateForm: React.FC<TaskCreateFormProps> = ({ submitLabel = "Create Task", onSuccess }) => {
  const [popOpenProjectName, setPopOpenProjectName] = useState(false);
  const [popOpenUserName, setPopOpenUserName] = useState(false);
  const [popOpenPriority, setPopOpenPriority] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectInfoInterface | null>(null);
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
    formState: { errors, isValid },
    setValue,
    watch,
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskFormSchema),
    mode: "onChange",
    defaultValues: {
      task_name: "",
      task_assignee_uuid: "",
      task_description: "",
      task_project_uuid: "",
      task_attachments: [],
      task_due_date: undefined,
      task_start_date: undefined,
      task_label: "",
      task_priority: "medium",
    },
  });

  const taskProjectUUID = watch("task_project_uuid");
  const taskAssigneeUUID = watch("task_assignee_uuid");

  // Sync Redux file uploads to local form state
  // We still use Redux for file upload progress because that might be global or handled by a specific uploader hook
  // But we could refactor that later. For now, we just sync the result.
  useEffect(() => {
    if (dialogInputState.projectUUID && dialogInputState.filesUploaded[dialogInputState.projectUUID]) {
       const attachments = dialogInputState.filesUploaded[dialogInputState.projectUUID].map(file => ({
          attachment_file_name: file.attachment_file_name,
          attachment_obj_key: file.attachment_obj_key,
          attachment_uuid: "",
          attachment_type: file.attachment_type,
          attachment_size: 0, // Default or fetch if available
          attachment_created_at: new Date().toISOString()
        }));
        setValue("task_attachments", attachments);
    }
  }, [dialogInputState.filesUploaded, dialogInputState.projectUUID, setValue]);

  useEffect(() => {
    if (
      projectsInfo.data?.data &&
      taskProjectUUID &&
      (!selectedProject || selectedProject.project_uuid !== taskProjectUUID)
    ) {
      const project = projectsInfo.data.data.find(p => p.project_uuid === taskProjectUUID);
      setSelectedProject(project || null);
    }
  }, [projectsInfo.data, taskProjectUUID, selectedProject]);

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
      .makeRequest<CreateTaskInterface>({
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
        },
      })
      .then(() => {
        dispatch(clearCreateTaskInputState());
        revalidateTaskKeys(data.task_project_uuid);
        if (onSuccess) onSuccess();
      });
  };

  const startDateWatch = watch("task_start_date");
  const dueDateWatch = watch("task_due_date");

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateTask)} className="grid gap-4 py-4">
        <div className="grid gap-2 mb-2">
          <Label htmlFor="task_name">Task Name:</Label>
          <Input id="task_name" {...register("task_name")} placeholder="Enter task name" autoFocus />
          {errors.task_name && <p className="text-red-500 text-sm">{errors.task_name.message}</p>}
        </div>
        
        <div className="grid gap-2 mb-2">
          {projectsInfo.data?.data && (
            <div className="flex items-center space-x-4">
              <p className="text-sm">Project:</p>
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
                          <>Select Project</>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" side="bottom" portalled={false}>
                      <Command>
                        <CommandInput placeholder="Select project..." />
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
          {errors.task_project_uuid && <p className="text-red-500 text-sm">{errors.task_project_uuid.message}</p>}
          
          {selectedProject && (
            <div className="flex mt-2 flex-wrap gap-x-4 gap-y-4">
              <div className="flex items-center gap-x-4">
                <p className="text-sm">For:</p>
                <Controller
                    control={control}
                    name="task_assignee_uuid"
                    render={({ field }) => (
                        <Popover open={popOpenUserName} onOpenChange={setPopOpenUserName}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="justify-start">
                            {selectedUser ? <>{selectedUser.user_name}</> : <>Select Member</>}
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
                                    <span>{member.user_name}</span>
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
              {errors.task_assignee_uuid && <p className="text-red-500 text-sm">{errors.task_assignee_uuid.message}</p>}
              
              <div className="flex items-center space-x-4">
                <p className="text-sm">Priority:</p>
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
                <Label htmlFor="task_label">Label:</Label>
                <Input id="task_label" {...register("task_label")} placeholder="Enter label" />
                {errors.task_label && <p className="text-red-500 text-sm">{errors.task_label.message}</p>}
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
                    placeholder="Enter description..."
                    editable={true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={(content: Content) => {
                        field.onChange(content?.toString() || "");
                    }}
                />
            )}
          />
          {errors.task_description && <p className="text-red-500 text-sm">{errors.task_description.message}</p>}
        </div>
        
        {selectedProject?.project_uuid && (
          <div>
            <Label htmlFor="file-upload" className="cursor-pointer">
              Attach Files
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
                <div key={index} className="flex relative justify-center items-center m-1 mt-2 p-1 border rounded-xl border-gray-700">
                  <button type="button" className="absolute top-0 right-0 p-1 -mt-2 -mr-2 bg-background rounded-full border-gray-700 border" onClick={() => removePreviewFile(file.key)}>
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
            
            <div className="flex space-x-8">
              <div className="relative">
                <Controller
                    control={control}
                    name="task_start_date"

                    render={({ field }) => {
                        const { isMobile } = useMedia();
                        const [open, setOpen] = useState(false);

                        const Trigger = (
                            <Button
                            variant="outline"
                            className={cn("pl-3 text-left font-normal mt-4", !field.value && "text-muted-foreground")}
                            >
                            {field.value ? (
                                format(field.value, "PP")
                            ) : (
                                <span>Start Date</span>
                            )}
                            <CalenderIcon className="ml-2 h-4 w-4" />
                            </Button>
                        );

                        const Content = (
                             <Calendar 
                                mode="single" 
                                selected={field.value} 
                                onSelect={(date) => {
                                    field.onChange(date);
                                    if(isMobile) setOpen(false);
                                }} 
                                initialFocus 
                                className={cn("p-3", isMobile && "w-full flex justify-center")}
                                classNames={isMobile ? {
                                    months: "w-full flex flex-col space-y-4 sm:space-x-4 sm:space-y-0",
                                    month: "space-y-4 w-full",
                                    table: "w-full border-collapse space-y-1",
                                    head_row: "flex w-full justify-between",
                                    row: "flex w-full mt-2 justify-between",
                                    cell: "text-center flex-1 p-0 relative focus-within:relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                                    head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
                                    day: "h-9 w-full p-0 font-normal aria-selected:opacity-100",
                                } : undefined}
                             />
                        );

                        if (isMobile) {
                            return (
                                <Drawer open={open} onOpenChange={setOpen}>
                                    <DrawerTrigger asChild>{Trigger}</DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerTitle className="sr-only">Select Start Date</DrawerTitle>
                                        <div className="mt-4 border-t pt-4 pb-4 flex flex-col items-center">
                                            {Content}
                                        </div>
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
                    }}

                />
                {startDateWatch && (
                  <Button variant="ghost" size="icon" className="absolute -right-4 top-0 transform rounded-full" onClick={() => setValue("task_start_date", undefined)}>
                    <X className="h-1 w-1" />
                  </Button>
                )}
              </div>
              {errors.task_start_date && <p className="text-red-500 text-sm">{errors.task_start_date.message}</p>}
              
              <div className="relative">
                <Controller
                    control={control}
                    name="task_due_date"

                    render={({ field }) => {
                        const { isMobile } = useMedia();
                        const [open, setOpen] = useState(false);

                        const Trigger = (
                            <Button
                            variant="outline"
                            className={cn("pl-3 text-left font-normal mt-4", !field.value && "text-muted-foreground")}
                            >
                            {field.value ? (
                                format(field.value, "PP")
                            ) : (
                                <span>Due Date</span>
                            )}
                            <CalenderIcon className="ml-2 h-4 w-4" />
                            </Button>
                        );

                        const Content = (
                             <Calendar 
                                mode="single" 
                                selected={field.value} 
                                onSelect={(date) => {
                                    field.onChange(date);
                                    if(isMobile) setOpen(false);
                                }} 
                                initialFocus 
                                className={cn("p-3", isMobile && "w-full flex justify-center")}
                                classNames={isMobile ? {
                                    months: "w-full flex flex-col space-y-4 sm:space-x-4 sm:space-y-0",
                                    month: "space-y-4 w-full",
                                    table: "w-full border-collapse space-y-1",
                                    head_row: "flex w-full justify-between",
                                    row: "flex w-full mt-2 justify-between",
                                    cell: "text-center flex-1 p-0 relative focus-within:relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                                    head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
                                    day: "h-9 w-full p-0 font-normal aria-selected:opacity-100",
                                } : undefined}
                             />
                        );

                        if (isMobile) {
                            return (
                                <Drawer open={open} onOpenChange={setOpen}>
                                    <DrawerTrigger asChild>{Trigger}</DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerTitle className="sr-only">Select Due Date</DrawerTitle>
                                        <div className="mt-4 border-t pt-4 pb-4 flex flex-col items-center">
                                            {Content}
                                        </div>
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
                    }}

                />
                {dueDateWatch && (
                  <Button variant="ghost" size="icon" className="absolute -right-4 top-0 transform rounded-full" onClick={() => setValue("task_due_date", undefined)}>
                    <X className="h-1 w-1" />
                  </Button>
                )}
              </div>
              {errors.task_due_date && <p className="text-red-500 text-sm">{errors.task_due_date.message}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" disabled={!isValid}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
};

export default TaskCreateForm;



