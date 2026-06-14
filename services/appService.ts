// Admin app-platform service. All routes are admin-gated server-side.

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { AppView, CreateAppRequest, UpdateAppRequest } from "@/types/app"

export async function listApps(): Promise<AppView[]> {
    const res = await axiosInstance.get(GetEndpointUrl.GetApps)
    const body = res.data as { data?: { apps?: AppView[] } }
    return body?.data?.apps ?? []
}

export async function getApp(appId: string): Promise<AppView | null> {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetApp}/${appId}`)
    return (res.data as { data?: AppView })?.data ?? null
}

export async function createApp(req: CreateAppRequest): Promise<AppView> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateApp, req)
    return (res.data as { data: AppView }).data
}

export async function updateApp(appId: string, req: UpdateAppRequest): Promise<AppView> {
    const res = await axiosInstance.patch(`${PostEndpointUrl.UpdateApp}/${appId}`, req)
    return (res.data as { data: AppView }).data
}

export async function setAppEnabled(appId: string, enabled: boolean): Promise<void> {
    await axiosInstance.post(`${PostEndpointUrl.SetAppEnabled}/${appId}/enabled`, { enabled })
}

export async function deleteApp(appId: string): Promise<void> {
    await axiosInstance.delete(`${PostEndpointUrl.DeleteApp}/${appId}`)
}

export async function disconnectApp(appId: string): Promise<void> {
    await axiosInstance.post(`${PostEndpointUrl.DisconnectApp}/${appId}/oauth-disconnect`, {})
}

// getOAuthInstallURL fetches the provider authorize URL and redirects the
// browser to it to start the OAuth install handshake.
export async function startOAuthInstall(appId: string): Promise<void> {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetAppOAuthURL}/${appId}/oauth-url`)
    const url = (res.data as { data?: { url?: string } })?.data?.url
    if (url) {
        window.location.href = url
    }
}

// ─── Curated marketplace (one-click install / uninstall) ───────────────────

export async function listMarketplace(): Promise<import("@/types/app").MarketplaceItem[]> {
    const res = await axiosInstance.get(GetEndpointUrl.GetMarketplace)
    const body = res.data as { data?: { apps?: import("@/types/app").MarketplaceItem[] } }
    return body?.data?.apps ?? []
}

export async function installTemplate(slug: string): Promise<AppView> {
    const res = await axiosInstance.post(PostEndpointUrl.InstallTemplate, { slug })
    return (res.data as { data: AppView }).data
}

export async function uninstallTemplate(slug: string): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.UninstallTemplate, { slug })
}

export interface AppTestResult {
    success: boolean
    message: string
}

// testApp runs a real credential/connectivity check for an installed app so the
// admin can verify setup before relying on it.
export async function testApp(appId: string): Promise<AppTestResult> {
    const res = await axiosInstance.post(`${PostEndpointUrl.TestApp}/${appId}/test`, {})
    return (res.data as { data: AppTestResult }).data
}
