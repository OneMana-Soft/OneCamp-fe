// Service layer for the user-facing slash command framework. Uses the shared
// cookie-auth axios instance and the centralized endpoint enums.

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
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
        ? `${GetEndpointUrl.GetCommandCatalog}?channel_id=${encodeURIComponent(channelId)}`
        : GetEndpointUrl.GetCommandCatalog
    const res = await axiosInstance.get(url, {
        // @ts-expect-error — suppress the global loading bar for this background poll
        silent: true,
    })
    const body = res.data as { data?: CatalogResponse }
    return body?.data ?? { commands: [] }
}
// executeCommand runs a slash command server-side.
export async function executeCommand(req: ExecuteCommandRequest): Promise<CommandResponse> {
    const res = await axiosInstance.post(PostEndpointUrl.ExecuteCommand, req)
    return (res.data as { data: CommandResponse }).data
}

// interactCommand sends a Block Kit button/select activation.
export async function interactCommand(req: InteractRequest): Promise<CommandResponse> {
    const res = await axiosInstance.post(PostEndpointUrl.InteractCommand, req)
    return (res.data as { data: CommandResponse }).data
}

// newTriggerID generates a client-side correlation id so async (deferred /
// external) responses arriving over MQTT can be matched to the card the user
// is currently viewing.
export function newTriggerID(): string {
    // crypto.randomUUID is available in all evergreen browsers we target.
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID()
    }
    return `trig_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
