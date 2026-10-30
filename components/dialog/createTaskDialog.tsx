import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance";
import { useToast } from "@/hooks/use-toast";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PostEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import TaskCreateForm from "@/components/task/taskCreateForm";
import { taskMadeReply, type TaskDraft, type TaskSource } from "@/lib/task/messageToTask";
import { useTaskAddress } from "@/hooks/useTaskAddress";

interface createTaskDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
  /** Present when the task is being made from a message. */
  fromMessage?: { draft: TaskDraft; source: TaskSource };
  /** Passed through to the form; the AI edition suggests a name here. */
  renderNameHint?: (current: string, use: (name: string) => void) => React.ReactNode;
  /** Opened from My Tasks: the new task is yours unless you pick someone else. */
  assignToMe?: boolean;
  /** Opened from a project: it's preselected. */
  projectId?: string;
  /** Opened from a link: the fields it names, as its query gave them (title=…&project=Q4). */
  address?: string;
  /** A doc comment's task, once it is tied to its thread. */
  onLinked?: (taskUUID: string) => void;
}

const CreateTaskDialog: React.FC<createTaskDialogProps> = ({
  dialogOpenState,
  setOpenState,
  fromMessage,
  renderNameHint,
  assignToMe,
  projectId,
  address,
  onLinked,
}) => {
  const post = usePost();
  // A link's fields are placed before the dialog opens, so the form starts from them.
  const { ready, address: named } = useTaskAddress(address ?? "");
  const { toast } = useToast();
  const fromLine = !fromMessage
    ? undefined
    : fromMessage.source.threadID
      ? "The task links back to the comment. Resolving either one resolves both."
      : "The task links back to the message, and a reply under it links to the task.";

  // Once the task exists, say so under the message it came from, as the person
  // who made it, so the thread shows the ask was picked up. The comment goes
  // through the ordinary reply endpoint, with its access checks; if it fails,
  // the task still stands and the toast has already confirmed it.
  const replyUnderMessage = ({ taskUUID, name }: { taskUUID: string; name: string }) => {
    const source = fromMessage?.source;
    if (!source) return;
    if (source.threadID) {
      // A doc comment's task is tied to its thread: resolving either resolves
      // both. Untied, that promise doesn't hold, so the person is told.
      void axiosInstance
        .post(`/threads/${encodeURIComponent(source.threadID)}/task`, { task_uuid: taskUUID }, OWN_ERRORS)
        .then(() => onLinked?.(taskUUID))
        .catch(() =>
          toast({ title: "The task isn't tied to the comment", description: "The task was made, but resolving one won't resolve the other.", variant: "destructive" }),
        );
      return;
    }
    const body = taskMadeReply(window.location.origin, taskUUID, name);
    if (source.postUUID) {
      void post
        .makeRequest({ apiEndpoint: PostEndpointUrl.CreatePostComment, payload: { post_id: source.postUUID, comment_text_html: body, comment_attachments: [] } })
        .catch(() => undefined);
    } else if (source.chatMessageID) {
      void post
        .makeRequest({ apiEndpoint: PostEndpointUrl.CreateChatComment, payload: { chat_id: source.chatMessageID, comment_text_html: body, comment_attachments: [] } })
        .catch(() => undefined);
    }
  };

  return (
    <Dialog open={dialogOpenState && ready} onOpenChange={setOpenState}>
      {/* A 640px composer (design v3, W36): the form draws its own bar and
          foot, so the dialog has no padding and its title is for readers. */}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="sr-only">
          <DialogTitle>{fromMessage ? "Make a task" : "New task"}</DialogTitle>
          <DialogDescription>{fromLine ?? "Name it and pick its project. The rest can wait."}</DialogDescription>
        </DialogHeader>
        {fromLine && <p className="px-4 pt-3 text-ui-sm text-ink-3">{fromLine}</p>}
        <TaskCreateForm
          submitLabel="Create task"
          prefill={fromMessage?.draft}
          address={named}
          assignToMe={assignToMe}
          defaultProjectId={projectId}
          renderNameHint={renderNameHint}
          onCreated={fromMessage ? replyUnderMessage : undefined}
          onSuccess={() => setOpenState(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskDialog;