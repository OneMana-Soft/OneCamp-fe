import type { ExecuteCommandRequest } from "@/types/command"

/** Where a slash command was typed: a channel, a direct or group conversation, a thread. */
export interface CommandPlace {
    channelId?: string
    dmGroupId?: string
    threadTs?: string
}

/**
 * The request that runs a slash command: the text after the command, where it
 * was typed, and the people picked from the @ list, by the name the text shows
 * them as (lower-cased) to their user ids. "/remind @Maya Chen …" carries only
 * "Maya Chen" in its text, which another person's handle can match; the server
 * tells who was picked from `mentions`.
 */
export function executeRequest(
    command: string,
    typed: string,
    place: CommandPlace,
    timezone: string,
    triggerId: string,
    mentions?: Record<string, string>,
): ExecuteCommandRequest {
    return {
        command,
        // The text after "/command ".
        text: typed.replace(/^\/?\S+\s*/, ""),
        channel_id: place.channelId,
        dm_group_id: place.dmGroupId,
        thread_ts: place.threadTs,
        timezone,
        trigger_id: triggerId,
        mentions: mentions && Object.keys(mentions).length > 0 ? mentions : undefined,
    }
}
