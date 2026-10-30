// Service layer for the user-facing slash command framework. Uses the shared
// cookie-auth axios instance and the centralized endpoint enums.

import axiosInstance from "@/lib/axiosInstance"
import { randomUUID } from "@/lib/utils/randomUUID"
import { ChatGet, ChatPost } from "@/services/endpoints/chat"
import type {
    CatalogResponse,
    CommandResponse,
    ExecuteCommandRequest,
    InteractRequest,
} from "@/types/command"

// fetchCommandCatalog returns the scope-filtered command list for the
// composer typeahead. The backend caches this per-user, so calling it once per
// channel mount is cheap; the FE filters client-side as the user types.
export async function fetchCommandCatalog(channelId?: string): Promise<CatalogResponse> {
    const url = channelId
        ? `${ChatGet.GetCommandCatalog}?channel_id=${encodeURIComponent(channelId)}`
        : ChatGet.GetCommandCatalog
    const res = await axiosInstance.get(url, {
        // @ts-expect-error — suppress the global loading bar for this background poll
        silent: true,
    })
    const body = res.data as { data?: CatalogResponse }
    return body?.data ?? { commands: [] }
}
// executeCommand runs a slash command server-side.
export async function executeCommand(req: ExecuteCommandRequest): Promise<CommandResponse> {
    const res = await axiosInstance.post(ChatPost.ExecuteCommand, req)
    return (res.data as { data: CommandResponse }).data
}

// interactCommand sends a Block Kit button/select activation.
export async function interactCommand(req: InteractRequest): Promise<CommandResponse> {
    const res = await axiosInstance.post(ChatPost.InteractCommand, req)
    return (res.data as { data: CommandResponse }).data
}

// newTriggerID generates a client-side correlation id so async (deferred /
// external) responses arriving over MQTT can be matched to the card the user
// is currently viewing. lib/utils/randomUUID, since crypto.randomUUID is
// missing where the app is served over plain http.
export function newTriggerID(): string {
    return randomUUID()
}
