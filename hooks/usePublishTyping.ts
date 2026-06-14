// Use the path import so webpack tree-shakes the rest of lodash. The
// project already has a custom throttle in `lib/utils/helpers/`, but
// lodash/throttle.cancel() is the API every existing call site
// expects, so we keep lodash here and pay only for the one function.
import throttle from 'lodash/throttle';
import { useCallback, useMemo } from 'react';
import axiosInstance from '@/lib/axiosInstance';
import { PostEndpointUrl } from '@/services/endPoints';

export type PublishTypingTargetType = 'channel' | 'chat' | 'groupChat';

interface PublishTypingProps {
    targetType: PublishTypingTargetType;
    targetId: string; // channelId, or userUuid (for DM), or grpUuid (for GroupChat)
}

/**
 * Strip TipTap's empty-paragraph noise so we can reliably detect "the
 * editor has content" vs "the editor is empty after a send / clear".
 * Mirrors removeEmptyPTags but keeps the helper here local so this hook
 * has no extra deps.
 */
function isMeaningfulContent(html: string): boolean {
    if (!html) return false;
    // Strip whitespace, <br>, &nbsp;, and empty <p> wrappers.
    const stripped = html
        .replace(/<p\b[^>]*>(?:\s|<br\s*\/?>|&nbsp;|&#160;)*<\/p>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/g, '')
        .trim();
    return stripped.length > 0;
}

export const usePublishTyping = ({ targetType, targetId }: PublishTypingProps) => {
    const publish = useCallback(() => {
        if (!targetId) return;

        if (targetType === 'channel') {
            axiosInstance.post(PostEndpointUrl.PublishChannelTyping, { channel_id: targetId }).catch(() => {});
        } else if (targetType === 'chat') {
            axiosInstance.post(PostEndpointUrl.PublishChatTyping, { user_uuid: targetId }).catch(() => {});
        } else if (targetType === 'groupChat') {
            axiosInstance.post(PostEndpointUrl.PublishChatTyping, { grp_id: targetId }).catch(() => {});
        }
    }, [targetType, targetId]);

    // Throttle the publish function to execute at most once every 3 seconds
    const publishWithThrottle = useMemo(
        () => throttle(publish, 3000, { trailing: false }),
        [publish]
    );

    /**
     * Wrapper around the throttled publish.
     *
     * Accepts the current editor content so we can suppress publishes
     * when the editor is empty (e.g. on send / clear / paste-then-delete).
     * Without this, the receiver sees a spurious "typing..." indicator
     * for ~4 seconds AFTER the message has already arrived, because the
     * editor's onChange fires once with empty content as part of the
     * clear-after-send flow.
     */
    const publishTyping = useCallback(
        (content?: string) => {
            // If we know the content and it's meaningless, drop the call.
            // If content is undefined (legacy callers), fall through and
            // let the throttle gate it.
            if (content !== undefined && !isMeaningfulContent(content)) {
                // Cancel any pending throttle so a stale leading-edge
                // call cannot fire after the editor has gone empty.
                publishWithThrottle.cancel();
                return;
            }
            publishWithThrottle();
        },
        [publishWithThrottle],
    );

    return { publishTyping };
};
