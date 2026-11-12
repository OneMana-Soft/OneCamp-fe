import type { AxiosRequestConfig } from "axios"
import { browserTZ } from "@/lib/utils/timeZone"

/**
 * A task read's request in the reader's zone (?tz=), so a formula's TODAY()
 * is their day (J-F). The zone rides the request, never the cache key: a
 * task's key is changed in many places, and the offline store keys by address.
 */
export const inReaderZone = (config?: AxiosRequestConfig): AxiosRequestConfig => ({ ...config, params: { ...config?.params, tz: browserTZ() } })
