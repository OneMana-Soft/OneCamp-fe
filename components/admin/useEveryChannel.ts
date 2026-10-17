"use client"

import type { AxiosRequestConfig } from "axios"
import useSWR from "swr"

import axiosInstance from "@/lib/axiosInstance"
import { readEveryByIndex } from "@/lib/http/pageIndex"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel"

/**
 * Every channel the reader can see, for a picker that must offer all of them
 * (a webhook's "Events from" and its channel). The list it read answers 20
 * channels at its default size, in graph order, so in a larger workspace most
 * channels could not be chosen (FE-11-G-1). This reads it page by page to the
 * end, sorted by name.
 */
export const EVERY_CHANNEL_PAGE_SIZE = 100
/** Pages read at most: 5,000 channels. */
export const EVERY_CHANNEL_PAGES_MAX = 50

type Page = ChannelInfoListInterfaceResp & { pageCount?: number }

/** Every page of the list (lib/http/pageIndex), each channel once, by name. */
export async function readEveryChannel(get: (url: string) => Promise<Page>): Promise<ChannelInfoInterface[]> {
  const { items } = await readEveryByIndex(
    async (pageIndex, pageSize) => (await get(`${GetEndpointUrl.GetAllActiveChannelList}?pageIndex=${pageIndex}&pageSize=${pageSize}`))?.channels_list ?? [],
    { pageSize: EVERY_CHANNEL_PAGE_SIZE, maxPages: EVERY_CHANNEL_PAGES_MAX, key: (ch) => ch?.ch_uuid },
  )
  return items.sort((a, b) => (a.ch_name ?? "").localeCompare(b.ch_name ?? "", undefined, { sensitivity: "base" }))
}

/**
 * The key starts with the list's own path, so whatever revalidates the
 * channel list (a channel made, renamed or archived) revalidates this too.
 */
const KEY = `${GetEndpointUrl.GetAllActiveChannelList}?every=1`

/**
 * requestConfig is the reads' own: a picker that says its failure in place
 * passes OWN_ERRORS, as it would to useFetch.
 */
export function useEveryChannel(enabled = true, requestConfig?: AxiosRequestConfig) {
  const { data, error, isLoading } = useSWR(enabled ? KEY : null, () =>
    readEveryChannel((url) => axiosInstance.get<Page>(url, requestConfig).then((r) => r.data)),
  )
  return { channels: data ?? [], isLoading: enabled && isLoading, isError: !!error }
}
