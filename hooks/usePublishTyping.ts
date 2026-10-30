// Use the path import so webpack tree-shakes the rest of lodash. The
// project already has a custom throttle in `lib/utils/helpers/`, but
// lodash/throttle.cancel() is the API every existing call site
// expects, so we keep lodash here and pay only for the one function.
import throttle from 'lodash/throttle';
import { useCallback, useMemo } from 'react';
import axiosInstance from '@/lib/axiosInstance';
import { ChatPost } from "@/services/endpoints/chat";
import { TYPING_REPEAT_MS } from '@/lib/typingTiming';
import { listIdOf } from '@/store/conversations';
import type { ConversationRef } from '@/lib/conversation/types';


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

/** Tells the others in a conversation that someone is typing there. */
export const usePublishTyping = (conversation: ConversationRef) => {
    const { kind } = conversation;
    const id = listIdOf(conversation);
    const publish = useCallback(() => {
        const body = kind === 'channel' ? { channel_id: id } : kind === 'dm' ? { user_uuid: id } : { grp_id: id };
        // A typing line that doesn't arrive is gone in 6 s anyway: nothing to retry or say.
        axiosInstance.post(kind === 'channel' ? ChatPost.PublishChannelTyping : ChatPost.PublishChatTyping, body).catch(() => {});
    }, [kind, id]);

    // At most once every 3 s: the receiver keeps the line up for 6 s, so it
    // holds while someone keeps typing (lib/typingTiming).
    const publishWithThrottle = useMemo(
        () => throttle(publish, TYPING_REPEAT_MS, { trailing: false }),
        [publish]
    );

    /**
     * Wrapper around the throttled publish.
     *
     * Accepts the current editor content so we can suppress publishes
     * when the editor is empty (e.g. on send / clear / paste-then-delete).
     * Without this, the receiver sees a spurious "typing..." indicator
     * for several seconds AFTER the message has already arrived, because the
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
