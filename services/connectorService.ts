// Per-user connector service. The AI reads/acts on the user's external
// accounts (Gmail, Calendar, GitHub) once connected here. All endpoints are
// authed and resolve the user server-side, so a user only ever manages their
// own connectors.

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ConnectorStatus } from "@/types/connector"

export async function listConnectors(): Promise<ConnectorStatus[]> {
    const res = await axiosInstance.get(GetEndpointUrl.Connectors)
    const body = res.data as { data?: { connectors?: ConnectorStatus[] } }
    return body?.data?.connectors ?? []
}

// startConnect fetches the provider authorize URL and redirects the browser to
// it. On completion the backend redirects back to the connectors settings page
// with ?connector=success|error.
export async function startConnect(provider: string): Promise<void> {
    const res = await axiosInstance.get(`${GetEndpointUrl.Connectors}/${provider}/connect`)
    const url = (res.data as { data?: { url?: string } })?.data?.url
    if (url) {
        window.location.href = url
    } else {
        throw new Error("No authorize URL returned")
    }
}

export async function disconnectConnector(provider: string): Promise<void> {
    await axiosInstance.post(`${GetEndpointUrl.Connectors}/${provider}/disconnect`, {})
}
