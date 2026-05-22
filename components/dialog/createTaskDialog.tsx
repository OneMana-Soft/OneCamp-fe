import React, {useEffect, useRef, useState} from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";
import MinimalTiptapTask from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { Content } from "@tiptap/react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import {
  clearCreateTaskInputState,
  deleteCreateTaskDialogPreviewFiles,
  removeCreateTaskUploadedFiles,
  updateCreateTaskDialogDescriptionInputText,
  updateCreateTaskDialogNameInputText,
  updateCreateTaskDialogProjectUUIDInputText,
  updateCreateTaskDialogUserUUIDInputText,
} from "@/store/slice/createTaskDailogSlice";
import { Calendar } from "@/components/ui/calendar";
import { X } from "@/lib/icons";
import { Calendar as CalenderIcon } from "@/lib/icons";
import { priorities, prioritiesInterface } from "@/types/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUploadFile } from "@/hooks/useUploadFile";
import { ProjectInfoInterface, ProjectInfoListRawInterface } from "@/types/project";
import { UserProfileDataInterface } from "@/types/user";
import { mutate } from "swr";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import {CreateTaskFormData, createTaskFormSchema, CreateTaskInterface} from "@/types/task";
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon";
import TaskCreateForm from "@/components/task/taskCreateForm";

interface createTaskDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
}



const CreateTaskDialog: React.FC<createTaskDialogProps> = ({
                                                             dialogOpenState,
                                                             setOpenState,
                                                           }) => {
  const [popOpenProjectName, setPopOpenProjectName] = useState(false);
  const [popOpenUserName, setPopOpenUserName] = useState(false);
  const [popOpenPriority, setPopOpenPriority] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectInfoInterface | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<prioritiesInterface | undefined>(
      priorities[1]
  );
  const uploadFile = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const post = usePost();
  const dialogInputState = useSelector((state: RootState) => state.createTaskDialog.dialogInputState);
  const projectsInfo = useFetch<ProjectInfoListRawInterface>(
      GetEndpointUrl.projectListByAdminUID
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setValue,
    watch,
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskFormSchema),
    mode: "onChange",
    defaultValues: {
      task_name: dialogInputState.taskName || "",
      task_assignee_uuid: dialogInputState.assigneeUUID || "",
      task_description: dialogInputState.taskDescription || "",
      task_project_uuid: dialogInputState.projectUUID || "",
      task_attachments: dialogInputState.filesUploaded[dialogInputState.projectUUID]?.map(
          (file) => ({
            attachment_file_name: file.attachment_file_name,
            attachment_obj_key: file.attachment_obj_key,
            attachment_uuid: "",
          })
      ) || [],
      task_due_date: undefined,
      task_start_date: undefined,
      task_label: "",
    },
  });

  // Watch form values
  const taskName = watch("task_name");
  const taskDescription = watch("task_description");
  const taskProjectUUID = watch("task_project_uuid");
  const taskAssigneeUUID = watch("task_assignee_uuid");

  // Sync Redux to form state
  useEffect(() => {
    if (
        projectsInfo.data?.data &&
        dialogInputState.projectUUID &&
        (!selectedProject || selectedProject.project_uuid !== dialogInputState.projectUUID)
    ) {
      const project = projectsInfo.data.data.find(
          (p) => p.project_uuid === dialogInputState.projectUUID
      );
      setSelectedProject(project || null);
      if (project) {
        setValue("task_project_uuid", project.project_uuid);
      }
    }
  }, [projectsInfo.data, dialogInputState.projectUUID, selectedProject, setValue]);

  useEffect(() => {
    if (
        selectedProject &&
        projectsInfo.data?.data &&
        dialogInputState.assigneeUUID &&
        (!selectedUser || selectedUser.user_uuid !== dialogInputState.assigneeUUID)
    ) {
      const user = selectedProject.project_members.find(
          (member) => member.user_uuid === dialogInputState.assigneeUUID
      );
      setSelectedUser(user || null);
      if (user) {
        setValue("task_assignee_uuid", user.user_uuid);
      }
    }
  }, [selectedProject, projectsInfo.data, dialogInputState.assigneeUUID, selectedUser, setValue]);

  // Sync form values to Redux (guard with last-sent refs to avoid loops)
  const debouncedTaskName = useDebounce(taskName, 250)
  const lastSentTaskNameRef = React.useRef<string | undefined>(undefined)
  useEffect(() => {
    if (lastSentTaskNameRef.current !== debouncedTaskName) {
      lastSentTaskNameRef.current = debouncedTaskName
      dispatch(updateCreateTaskDialogNameInputText({ taskName: debouncedTaskName }))
    }
  }, [debouncedTaskName, dispatch])

  const debouncedTaskDescription = useDebounce(taskDescription, 300)
  const lastSentTaskDescRef = React.useRef<string | undefined>(undefined)
  useEffect(() => {
    const normalized = debouncedTaskDescription || ""
    if (lastSentTaskDescRef.current !== normalized) {
      lastSentTaskDescRef.current = normalized
      dispatch(updateCreateTaskDialogDescriptionInputText({ taskDescription: normalized }))
    }
  }, [debouncedTaskDescription, dispatch])

  const lastSentProjectUUIDRef = React.useRef<string | undefined>(undefined)
  useEffect(() => {
    if (lastSentProjectUUIDRef.current !== taskProjectUUID) {
      lastSentProjectUUIDRef.current = taskProjectUUID
      dispatch(updateCreateTaskDialogProjectUUIDInputText({ projectUUID: taskProjectUUID }))
    }
  }, [taskProjectUUID, dispatch])

  const lastSentAssigneeUUIDRef = React.useRef<string | undefined>(undefined)
  useEffect(() => {
    if (lastSentAssigneeUUIDRef.current !== taskAssigneeUUID) {
      lastSentAssigneeUUIDRef.current = taskAssigneeUUID
      dispatch(updateCreateTaskDialogUserUUIDInputText({ userUUID: taskAssigneeUUID || "" }))
    }
  }, [taskAssigneeUUID, dispatch])

  const handleFileUpload = React.useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length || !dialogInputState.projectUUID) return;

        await uploadFile.makeRequestToUploadToCreateTask(files, dialogInputState.projectUUID);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      [dialogInputState.projectUUID, uploadFile]
  );

  const removePreviewFile = (key: string) => {
    dispatch(
        deleteCreateTaskDialogPreviewFiles({
          key,
          projectUUID: dialogInputState.projectUUID,
        })
    );
    dispatch(
        removeCreateTaskUploadedFiles({
          key,
          projectUUID: dialogInputState.projectUUID,
        })
    );

    const currentAttachments = watch("task_attachments") || [];
    setValue(
        "task_attachments",
        currentAttachments.filter(
            (attachment) =>
                attachment.attachment_file_name !==
                dialogInputState.filesUploaded[dialogInputState.projectUUID].find((f) => f.attachment_obj_key === key)
                    ?.attachment_file_name
        )
    );
  };

  const handleCreateTask = async (data: CreateTaskFormData) => {
    post.makeRequest<CreateTaskInterface>({
      apiEndpoint: PostEndpointUrl.CreateTask,
      payload: {
        task_name: data.task_name,
        task_assignee_uuid: data.task_assignee_uuid,
        task_description: data.task_description,
        task_project_uuid: data.task_project_uuid,
        task_attachments: data.task_attachments || [],
        task_label: data.task_label,
        task_due_date: data.task_due_date ? data.task_due_date.toISOString() : undefined,
        task_start_date: data.task_start_date ? data.task_start_date.toISOString() : undefined,
      }
    }).then(() => {
      mutate((key) => typeof key === "string" && key.startsWith("/api/user/assignedTaskList"));
      mutate(
          (key) => typeof key === "string" && key.startsWith(`/api/project/taskList/${dialogInputState.projectUUID}`)
      );

      dispatch(clearCreateTaskInputState());
      closeModal();
    });
  };

  function closeModal() {
    setOpenState(false);
  }

  return (
    <Dialog open={dialogOpenState} onOpenChange={setOpenState}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Create a new task</DialogDescription>
        </DialogHeader>
        <TaskCreateForm submitLabel="Create Task" onSuccess={() => setOpenState(false)} />
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskDialog;