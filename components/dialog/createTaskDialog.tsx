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

interface createTaskDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
  /** Present when the task is being made from a message. */
  fromMessage?: { draft: TaskDraft; source: TaskSource };
}

const CreateTaskDialog: React.FC<createTaskDialogProps> = ({
  dialogOpenState,
  setOpenState,
  fromMessage,
}) => {
  const post = usePost();

  // Once the task exists, say so under the message it came from, as the person
  // who made it, so the thread shows the ask was picked up. The comment goes
  // through the ordinary reply endpoint, with its access checks; if it fails,
  // the task still stands and the toast has already confirmed it.
  const replyUnderMessage = ({ taskUUID, name }: { taskUUID: string; name: string }) => {
    const source = fromMessage?.source;
    if (!source) return;
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
    <Dialog open={dialogOpenState} onOpenChange={setOpenState}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{fromMessage ? "Make a task" : "Create Task"}</DialogTitle>
          <DialogDescription>
            {fromMessage
              ? "The task links back to the message, and a reply under it links to the task."
              : "Create a new task"}
          </DialogDescription>
        </DialogHeader>
        <TaskCreateForm
          submitLabel="Create Task"
          prefill={fromMessage?.draft}
          onCreated={fromMessage ? replyUnderMessage : undefined}
          onSuccess={() => setOpenState(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskDialog;