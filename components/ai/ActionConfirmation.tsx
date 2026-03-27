import React, { useState, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useExecuteAction, type ProposedAction } from '@/services/aiService';
import { createPostLocally, updateChannelScrollToBottom } from '@/store/slice/channelSlice';
import { createListForTaskInfo, updateTaskDueDateInTaskList } from '@/store/slice/taskInfoSlice';
import { createChat } from '@/store/slice/chatSlice';
import { createGroupChat } from '@/store/slice/groupChatSlice';
import { useFetchOnlyOnce } from '@/hooks/useFetch';
import { GetEndpointUrl } from '@/services/endPoints';
import {UserProfileDataInterface, UserProfileInterface} from '@/types/user';

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

    // Escape key dismiss
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

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

                // send_message: push new post into channel Redux
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

                // send_dm: push new chat into DM Redux
                if (data?.tool === 'send_dm' && profileData) {
                    // dispatch(
                    //     createChat({
                    //         dmId: chatId,
                    //         chatCreatedAt: res?.chat_created_at,
                    //         chatBy:
                    //             selfProfile.data?.data || ({} as UserProfileDataInterface),
                    //         chatText: body,
                    //         attachments: chatState.filesUploaded,
                    //         chatId: res?.uuid,
                    //         chatTo:
                    //             otherUserInfo.data?.data || ({} as UserProfileDataInterface),
                    //     })
                    // );
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

                // send_group_chat: push new chat into group chat Redux
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

                // create_task: clear the task list so it refetches on next navigation
                if (action.tool_name === 'create_task') {
                    dispatch(createListForTaskInfo({ tasksInfo: [] }));
                }

                // set_reminder: update the due date in the visible task list
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
        <div className="action-confirmation-overlay">
            <div className="action-confirmation">
                <div className="action-header">
                    <span className="action-title">🤖 AI Suggested Actions</span>
                    <button className="action-close" onClick={onClose}>×</button>
                </div>

                <div className="action-list">
                    {actions.map((action, index) => {
                        const executed = executedActions[index];
                        return (
                            <div key={index} className={`action-card ${executed ? (executed.success ? 'action-success' : 'action-failed') : ''}`}>
                                <div className="action-card-header">
                                    <span className="action-icon">{TOOL_ICONS[action.tool_name] || '⚡'}</span>
                                    <span className="action-tool-name">{TOOL_LABELS[action.tool_name] || action.tool_name}</span>
                                </div>
                                <p className="action-description">{action.description}</p>

                                {/* Parameter preview — hide internal UUIDs */}
                                <div className="action-params">
                                    {Object.entries(action.params || {})
                                        .filter(([key]) => !key.endsWith('_uuid'))
                                        .map(([key, value]) => (
                                        <div key={key} className="action-param">
                                            <span className="param-key">{key.replace(/_/g, ' ')}:</span>
                                            <span className="param-value">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Action buttons */}
                                {!executed ? (
                                    <div className="action-buttons">
                                        <button
                                            className="action-btn-confirm"
                                            onClick={() => handleConfirm(action, index)}
                                            disabled={submittingIndex !== null}
                                        >
                                            {submittingIndex === index ? 'Executing...' : '✓ Confirm'}
                                        </button>
                                        <button className="action-btn-dismiss" onClick={onClose}>
                                            ✕ Dismiss
                                        </button>
                                    </div>
                                ) : (
                                    <div className={`action-result ${executed.success ? 'result-success' : 'result-error'}`}>
                                        {executed.success ? '' : '❌'} {executed.message}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <style jsx>{`
                .action-confirmation-overlay {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    z-index: 1100;
                }
                .action-confirmation {
                    width: 400px;
                    max-height: 80vh;
                    overflow-y: auto;
                    background: rgba(24, 24, 32, 0.97);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    color: #e4e4e7;
                }
                .action-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                }
                .action-title {
                    font-weight: 600;
                    font-size: 15px;
                }
                .action-close {
                    background: none;
                    border: none;
                    color: #71717a;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 0 4px;
                }
                .action-close:hover { color: #e4e4e7; }
                .action-list {
                    padding: 12px 16px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .action-card {
                    padding: 14px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    transition: all 0.2s;
                }
                .action-card:hover {
                    border-color: rgba(99, 102, 241, 0.2);
                }
                .action-success {
                    border-color: rgba(34, 197, 94, 0.3) !important;
                    background: rgba(34, 197, 94, 0.05) !important;
                }
                .action-failed {
                    border-color: rgba(239, 68, 68, 0.3) !important;
                    background: rgba(239, 68, 68, 0.05) !important;
                }
                .action-card-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .action-icon { font-size: 18px; }
                .action-tool-name {
                    font-weight: 600;
                    font-size: 13px;
                    color: #a5b4fc;
                }
                .action-description {
                    font-size: 13px;
                    line-height: 1.5;
                    color: #d4d4d8;
                    margin: 0 0 10px 0;
                }
                .action-params {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 12px;
                    padding: 8px 10px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    font-size: 12px;
                }
                .action-param {
                    display: flex;
                    gap: 6px;
                }
                .param-key {
                    color: #71717a;
                    text-transform: capitalize;
                    min-width: 80px;
                }
                .param-value {
                    color: #e4e4e7;
                    word-break: break-word;
                }
                .action-buttons {
                    display: flex;
                    gap: 8px;
                }
                .action-btn-confirm {
                    flex: 1;
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .action-btn-confirm:hover {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }
                .action-btn-confirm:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .action-btn-dismiss {
                    padding: 8px 16px;
                    background: none;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #71717a;
                    font-size: 13px;
                    cursor: pointer;
                }
                .action-btn-dismiss:hover {
                    border-color: rgba(255, 255, 255, 0.2);
                    color: #a1a1aa;
                }
                .action-result {
                    font-size: 12px;
                    padding: 8px 10px;
                    border-radius: 8px;
                }
                .result-success {
                    color: #4ade80;
                    background: rgba(34, 197, 94, 0.1);
                }
                .result-error {
                    color: #fca5a5;
                    background: rgba(239, 68, 68, 0.1);
                }
            `}</style>
        </div>
    );
};

export default ActionConfirmation;
