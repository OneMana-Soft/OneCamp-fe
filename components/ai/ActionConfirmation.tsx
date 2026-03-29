import React, { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { cn } from "@/lib/utils/helpers/cn";
import { useExecuteAction, type ProposedAction } from '@/services/aiService';
import { createPostLocally, updateChannelScrollToBottom } from '@/store/slice/channelSlice';
import { createListForTaskInfo, updateTaskDueDateInTaskList } from '@/store/slice/taskInfoSlice';
import { createChat } from '@/store/slice/chatSlice';
import { createGroupChat } from '@/store/slice/groupChatSlice';
import { useFetchOnlyOnce } from '@/hooks/useFetch';
import { GetEndpointUrl } from '@/services/endPoints';
import { UserProfileInterface } from '@/types/user';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button";

interface ActionConfirmationProps {
    actions: ProposedAction[];
    onClose: () => void;
    onActionComplete?: (toolName: string, success: boolean, message: string) => void;
}

const TOOL_ICONS: Record<string, string> = {
    create_task: '📋',
    create_doc: '📄',
    send_message: '📢',
    send_dm: '💬',
    send_group_chat: '👥',
    set_reminder: '⏰',
    summarize_channel: '📝',
    summarize_dm: '💬',
    summarize_group_chat: '👥',
};

const TOOL_LABELS: Record<string, string> = {
    create_task: 'Create Task',
    create_doc: 'Create Document',
    send_message: 'Send Channel Message',
    send_dm: 'Send Direct Message',
    send_group_chat: 'Send Group Chat Message',
    set_reminder: 'Set Reminder',
    summarize_channel: 'Summarize Channel',
    summarize_dm: 'Summarize Direct Message',
    summarize_group_chat: 'Summarize Group Chat',
};

const ActionConfirmation: React.FC<ActionConfirmationProps> = ({
    actions,
    onClose,
    onActionComplete,
}) => {
    const { executeAction } = useExecuteAction();
    const dispatch = useDispatch();
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const [executedActions, setExecutedActions] = useState<Record<number, { success: boolean; message: string }>>({});
    const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);

    const handleConfirm = useCallback(async (action: ProposedAction, index: number) => {
        setSubmittingIndex(index);
        const result = await executeAction(action.tool_name, action.params);
        setSubmittingIndex(null);
        if (result) {
            setExecutedActions(prev => ({ ...prev, [index]: { success: result.success, message: result.message } }));
            onActionComplete?.(action.tool_name, result.success, result.message);

            if (result.success) {
                const data = result.action_data;
                const profileData = selfProfile?.data?.data;

                if (data?.tool === 'send_message' && profileData) {
                    const channelId = data.channel_uuid;
                    dispatch(createPostLocally({
                        channelId,
                        postUUID: data.post_uuid,
                        postText: data.post_text,
                        postCreatedAt: data.post_created_at,
                        postBy: profileData,
                        attachments: [],
                    }));
                    dispatch(updateChannelScrollToBottom({ channelId, scrollToBottom: true }));
                }

                if (data?.tool === 'send_dm' && profileData) {
                    dispatch(createChat({
                        dmId: data.recipient_uuid,
                        chatId: data.chat_uuid,
                        chatText: data.chat_text,
                        chatCreatedAt: data.chat_created_at,
                        chatBy: profileData,
                        chatTo: {
                            user_uuid: data.recipient_uuid,
                            user_name: data.recipient_name,
                            user_profile_object_key: ''
                        },
                        attachments: [],
                    }));
                }

                if (data?.tool === 'send_group_chat' && profileData) {
                    dispatch(createGroupChat({
                        grpId: data.grp_id,
                        chatId: data.chat_uuid,
                        chatText: data.chat_text,
                        chatCreatedAt: data.chat_created_at,
                        chatBy: profileData,
                        attachments: [],
                    }));
                }

                if (action.tool_name === 'create_task') {
                    dispatch(createListForTaskInfo({ tasksInfo: [] }));
                }

                if (action.tool_name === 'set_reminder' && action.params.task_uuid) {
                    dispatch(updateTaskDueDateInTaskList({
                        taskId: action.params.task_uuid,
                        value: action.params.due_date || '',
                    }));
                }
            }
        }
    }, [executeAction, onActionComplete, dispatch, selfProfile]);

    if (actions.length === 0) return null;

    return (
        <Dialog open={actions.length > 0} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] p-0 border border-border bg-popover/95 backdrop-blur-xl shadow-2xl text-popover-foreground">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <span>🤖</span> AI Suggested Actions
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3 px-6 pb-6 pt-2 overflow-y-auto max-h-[70vh] scrollbar-thin">
                    {actions.map((action, index) => {
                        const executed = executedActions[index];
                        return (
                            <div key={index} className={cn(
                                "p-4 bg-muted/40 border border-border rounded-xl transition-all duration-200 hover:border-primary/40",
                                executed?.success && "border-green-500/40 bg-green-500/5",
                                executed && !executed.success && "border-destructive/40 bg-destructive/5"
                            )}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[18px]">{TOOL_ICONS[action.tool_name] || '⚡'}</span>
                                    <span className="font-semibold text-sm text-primary">{TOOL_LABELS[action.tool_name] || action.tool_name}</span>
                                </div>
                                <p className="text-[13px] leading-relaxed text-muted-foreground m-0 mb-3">{action.description}</p>

                                <div className="flex flex-col gap-1.5 mb-4 p-2.5 bg-background/50 border border-border/20 rounded-lg text-xs">
                                    {Object.entries(action.params || {})
                                        .filter(([key]) => !key.endsWith('_uuid'))
                                        .map(([key, value]) => (
                                        <div key={key} className="flex gap-2">
                                            <span className="text-muted-foreground capitalize min-w-[80px] font-medium">{key.replace(/_/g, ' ')}:</span>
                                            <span className="text-foreground break-words">{value as string}</span>
                                        </div>
                                    ))}
                                </div>
 
                                {!executed ? (
                                    <div className="flex gap-2">
                                        <Button
                                            className="flex-1 bg-gradient-to-br from-primary to-primary/80 text-white font-semibold transition-all duration-150 hover:from-primary/90 hover:to-primary/70 hover:shadow-primary/30"
                                            onClick={() => handleConfirm(action, index)}
                                            disabled={submittingIndex !== null}
                                        >
                                            {submittingIndex === index ? 'Executing...' : '✓ Confirm'}
                                        </Button>
                                        <Button 
                                            variant="outline"
                                            className="bg-transparent border-border text-muted-foreground font-medium transition-all duration-150 hover:border-primary/20 hover:text-foreground" 
                                            onClick={onClose}
                                        >
                                            ✕ Dismiss
                                        </Button>
                                    </div>
                                ) : (
                                    <div className={cn(
                                        "text-[13px] p-2.5 rounded-lg font-medium",
                                        executed.success ? "text-green-400 bg-green-500/10" : "text-red-300 bg-red-500/10"
                                    )}>
                                        {executed.success ? '' : '❌'} {executed.message}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

        </DialogContent>
        </Dialog>
    );
};

export default ActionConfirmation;
