"use client"

// useClientConfig exposes workspace client config (currently the upload limit)
// fetched once and cached by SWR. The composer/upload paths use it to validate
// a file's size BEFORE uploading, so the user gets an instant, precise message
// instead of waiting for a failed request.

import useSWR from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"

export interface ClientConfig {
    upload_limit_mb: number
    upload_limit_bytes: number
    // Runtime transcription mode. Drives whether the browser Web-Speech
    // transcriber runs ("frontend"), defers to the server-side agent
    // ("backend"), or is disabled ("off"). Admin-controlled at runtime, so
    // it can change without a frontend rebuild.
    transcription_mode: "frontend" | "backend" | "off"
}

// A sane default mirrors the backend default (10 MB) so validation still works
// before the config request resolves.
const DEFAULT_UPLOAD_LIMIT_MB = 10
const DEFAULT_CONFIG: ClientConfig = {
    upload_limit_mb: DEFAULT_UPLOAD_LIMIT_MB,
    upload_limit_bytes: DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024,
    transcription_mode: "frontend",
}

async function fetchClientConfig(): Promise<ClientConfig> {
    const res = await axiosInstance.get(GetEndpointUrl.GetClientConfig, {
        // @ts-expect-error — suppress the global loading bar for this background fetch
        silent: true,
    })
    const data = (res.data as { data?: Partial<ClientConfig> })?.data
    if (!data) return DEFAULT_CONFIG
    // Merge over defaults so a backend that hasn't shipped a field yet (or a
    // partial payload) never yields an undefined transcription_mode.
    return { ...DEFAULT_CONFIG, ...data } as ClientConfig
}

export function useClientConfig(): ClientConfig {
    const { data } = useSWR("client-config", fetchClientConfig, {
        revalidateOnFocus: false,
        dedupingInterval: 5 * 60 * 1000,
        fallbackData: DEFAULT_CONFIG,
    })
    return data ?? DEFAULT_CONFIG
}

// formatBytes renders a human-friendly size for messages ("12.4 MB").
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB"]
    let val = bytes / 1024
    let i = 0
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024
        i++
    }
    return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`
}
